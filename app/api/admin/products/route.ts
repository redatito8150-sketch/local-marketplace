import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
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
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
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

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: ProductInput = await request.json();

  // Fetched before validation (not after, as this used to be) so
  // isPartnerBrand can be set from the real brand row before
  // validateProductInput runs — needed for the "needs stock > 0 to
  // publish" check to correctly skip a partner brand, whose variants
  // always start at 0 live quantity by design (see forceZeroOpeningStock
  // below). Never trust body.brandId's partner claim, only this row's.
  const { data: brandRow } = await supabaseAdmin
    .from("brands")
    .select("id, name, is_mahaly_partner")
    .eq("id", body.brandId)
    .maybeSingle();
  if (!brandRow) {
    return NextResponse.json({ error: "Selected brand was not found" }, { status: 400 });
  }
  body.isPartnerBrand = Boolean(brandRow.is_mahaly_partner);

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

  // The product's own SKU is always server-generated.
  const { data: generatedSku, error: skuError } = await supabaseAdmin.rpc("next_product_sku", {
    p_brand_id: body.brandId,
  });
  if (skuError || !generatedSku) {
    return NextResponse.json(
      {
        error: skuError?.message?.includes("sku_prefix")
          ? "This brand has no SKU prefix configured yet — set one in Brand settings first"
          : "Failed to generate a product SKU",
      },
      { status: 400 }
    );
  }

  const productPayload = buildProductPersistencePayload(body);
  productPayload.sku = generatedSku;

  const baseSlug = slugify(body.name) || "product";
  let id = "";
  let inserted = false;

  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    id = `${baseSlug}-${randomSuffix()}`;
    const { error } = await supabaseAdmin.from("products").insert({ id, ...productPayload });

    if (!error) {
      inserted = true;
    } else if (error.code !== "23505" /* unique_violation */) {
      return safeErrorResponse("admin.products.create", error, "Failed to create product");
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
    return NextResponse.json({ error: `Product created, but ${optionsResult.error}` }, { status: 500 });
  }

  const variantsResult = await syncProductVariants({
    productId: id,
    productSku: generatedSku as string,
    submitted: body.variants,
    actorId: admin.id,
    operationKey: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
    forceZeroOpeningStock: Boolean(brandRow.is_mahaly_partner),
  });
  if (!variantsResult.ok) {
    return NextResponse.json({ error: `Product created, but ${variantsResult.error}` }, { status: 500 });
  }

  const colorImagesResult = await replaceProductColorImages({ productId: id, colorImages: body.colorImages });
  if (!colorImagesResult.ok) {
    return NextResponse.json({ error: `Product created, but ${colorImagesResult.error}` }, { status: 500 });
  }
  const mediaResult = await replaceProductMedia({ productId: id, coverUrl: body.image, galleryUrls: body.images ?? [], colorImages: body.colorImages });
  if (!mediaResult.ok) return NextResponse.json({ error: `Product created, but ${mediaResult.error}` }, { status: 500 });

  const variants = await loadProductVariants(id);

  await notify(
    body.status === "published" ? "product_published" : "product_created",
    body.status === "published" ? `Product published: ${body.name}` : `Product created: ${body.name}`,
    brandRow.name,
    {
      entityId: id,
      entityIdLabel: "Product ID",
      actorLabel: admin.email ?? admin.id,
      detailLabel: "Brand",
    }
  );

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "product",
    entityId: id,
    action: "create",
    after: body,
  });

  return NextResponse.json({ id, sku: generatedSku, variants });
}
