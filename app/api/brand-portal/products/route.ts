import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
import { describeProductCreate } from "@/lib/admin/describeProductChange";
import { resolveTaxonomyLeaf } from "@/lib/admin/resolveTaxonomyLeaf";
import { resolveCollectionOwnership } from "@/lib/admin/resolveCollectionOwnership";
import { buildProductPersistencePayload } from "@/lib/admin/productPersistence";
import {
  syncProductVariants,
  replaceProductOptionSelections,
  replaceProductColorImages,
  replaceProductMedia,
} from "@/lib/admin/variantPersistence";
import { loadProductVariants } from "@/lib/admin/loadProductVariants";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

// Instant-Publish: a brand owner/assistant's new product goes live on save,
// scoped strictly to their own brand — the admin is just notified
// afterward with a full description of what happened, never blocked
// waiting on a review queue. An admin viewing this brand's portal
// (isImpersonating) never creates on the brand's behalf — only the real
// owner/assistant does.
export async function POST(request: NextRequest) {
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Keyed by user, not IP — this is an authenticated, instant-publish write
  // path (goes live immediately, no review queue), so a compromised or
  // malicious brand-portal account shouldn't be able to script unlimited
  // product creation.
  if (!checkRateLimit(`brand-portal-product-create:${owner.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body: ProductInput = await request.json();
  // Never trust the client for which brand this belongs to, even though
  // the form locks it — force it server-side to the caller's own brand.
  body.brandId = owner.brandId;
  // Brand-portal writes draft, published, or archived — archiving is a
  // real, brand-owner-usable action (e.g. quietly building a whole
  // collection before revealing it at once), gated by the same
  // completeness bar as publishing (validateProductSections below).
  // Anything else collapses to published.
  body.status = body.status === "draft" || body.status === "archived" ? body.status : "published";

  const validationError = validateProductInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const taxonomy = await resolveTaxonomyLeaf(body.productTypeId);
  if (!taxonomy.valid) {
    return NextResponse.json({ error: taxonomy.error }, { status: 400 });
  }
  body.productTypeId = taxonomy.productTypeId;

  const collectionCheck = await resolveCollectionOwnership(body.collectionId, body.brandId);
  if (!collectionCheck.valid) {
    return NextResponse.json({ error: collectionCheck.error }, { status: 400 });
  }

  const { data: generatedSku, error: skuError } = await supabaseAdmin.rpc("next_product_sku", {
    p_brand_id: body.brandId,
  });
  if (skuError || !generatedSku) {
    return NextResponse.json(
      {
        error: skuError?.message?.includes("sku_prefix")
          ? "Your brand doesn't have a SKU prefix configured yet — ask an admin to set one before creating products"
          : "Failed to generate a product SKU",
      },
      { status: 400 }
    );
  }

  const productPayload = buildProductPersistencePayload(body, {
    submittedBy: owner.user.id,
  });
  productPayload.sku = generatedSku;
  productPayload.featured = false;

  const baseSlug = slugify(body.name) || "product";
  let id = "";
  let inserted = false;

  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    id = `${baseSlug}-${randomSuffix()}`;
    const { error } = await supabaseAdmin.from("products").insert({ id, ...productPayload });

    if (!error) {
      inserted = true;
    } else if (error.code !== "23505" /* unique_violation */) {
      return safeErrorResponse("brand-portal.products.create", error, "Failed to submit product");
    }
  }

  if (!inserted) {
    return NextResponse.json(
      { error: "Failed to generate a unique product id, please try again" },
      { status: 500 }
    );
  }

  const optionsResult = await replaceProductOptionSelections({
    productId: id,
    optionTypeIdsInOrder: body.optionTypeIds,
    valueIdsByOptionType: new Map(Object.entries(body.valueIdsByOptionType)),
  });
  if (!optionsResult.ok) {
    return NextResponse.json({ error: `Product submitted, but ${optionsResult.error}` }, { status: 500 });
  }

  const variantsResult = await syncProductVariants({
    productId: id,
    productSku: generatedSku as string,
    submitted: body.variants,
    actorId: owner.user.id,
    operationKey: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
    forceZeroOpeningStock: owner.isMahalyPartner,
  });
  if (!variantsResult.ok) {
    return NextResponse.json({ error: `Product submitted, but ${variantsResult.error}` }, { status: 500 });
  }

  const colorImagesResult = await replaceProductColorImages({ productId: id, colorImages: body.colorImages });
  if (!colorImagesResult.ok) {
    return NextResponse.json({ error: `Product submitted, but ${colorImagesResult.error}` }, { status: 500 });
  }
  const mediaResult = await replaceProductMedia({ productId: id, coverUrl: body.image, galleryUrls: body.images ?? [], colorImages: body.colorImages });
  if (!mediaResult.ok) return NextResponse.json({ error: `Product submitted, but ${mediaResult.error}` }, { status: 500 });

  const variants = await loadProductVariants(id);

  const auditLogId = await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "product",
    entityId: id,
    action: "create",
    after: body,
    brandSlug: owner.brandSlug ?? undefined,
  });

  // A draft save isn't live yet — nothing for the admin to review/revert,
  // so only notify once the brand owner actually publishes.
  if (body.status === "published") {
    await notify(
      "product_published",
      `New product published: ${body.name}`,
      describeProductCreate(body),
      {
        relatedEntityType: "product",
        relatedEntityId: id,
        auditLogId,
        actorLabel: owner.user.email ?? owner.user.id,
      }
    );
  }

  return NextResponse.json({ id, sku: generatedSku, variants });
}
