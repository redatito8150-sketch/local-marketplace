import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
import { diffVariantList } from "@/lib/auditDiff";
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
import { safeErrorResponse } from "@/lib/apiError";
import { checkAndNotifyWishlistPriceDrop } from "@/lib/wishlistPriceDrop";
import { getPartnerStockWarning } from "@/lib/admin/warehouseArchiveWarning";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  const previousStatus = existing.status;
  const { data: brandRow } = await supabaseAdmin.from("brands").select("is_mahaly_partner").eq("id", existing.brand_id).maybeSingle();

  const body: ProductInput = await request.json();

  // SECOND CORRECTIVE PASS: the original guard here only blocked
  // archived -> published, which still let a caller do archived -> draft
  // through this same route and then republish through the ordinary
  // (unguarded, since it no longer sees "archived") publish flow — a
  // two-step bypass around restore_product entirely. An archived product
  // must only ever leave "archived" through restore_product itself (which
  // targets draft — see that function's comment in supabase/migrations/
  // 20260814020000_product_deletion_lifecycle.sql), so this route now
  // rejects ANY status change away from "archived", not just to
  // "published". The products_enforce_archived_transition trigger backs
  // this up at the database level regardless of what this route does.
  if (existing.status === "archived" && body.status !== "archived") {
    return NextResponse.json(
      { error: "This product is archived. Use Restore product to bring it back — editing status directly is not allowed for archived products." },
      { status: 409 }
    );
  }
  // Brand and SKU are immutable after creation — whatever the client
  // sends is ignored, always the existing product's own values.
  body.brandId = existing.brand_id;
  // Same "never trust the client" rule — lets validateProductSections
  // skip the "needs stock > 0" publish requirement for a partner brand,
  // whose variants always start at 0 live quantity by design (see
  // forceZeroOpeningStock below).
  body.isPartnerBrand = Boolean(brandRow?.is_mahaly_partner);

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

  const productPayload = buildProductPersistencePayload(body, {
    previousPublishDate: existing.publish_date,
    previousStatus: existing.status,
  });
  delete productPayload.brand_id; // immutable, never part of an update

  const { error } = await supabaseAdmin.from("products").update(productPayload).eq("id", params.id);
  if (error) {
    return safeErrorResponse("admin.products.update", error, "Failed to update product");
  }

  const optionsResult = await replaceProductOptionSelections({
    productId: params.id,
    optionTypeIdsInOrder: body.optionTypeIds,
    valueIdsByOptionType: new Map(Object.entries(body.valueIdsByOptionType)),
  });
  if (!optionsResult.ok) {
    return NextResponse.json({ error: `Product updated. However, ${optionsResult.error}` }, { status: 500 });
  }

  const existingVariants = await loadProductVariants(params.id);

  const variantsResult = await syncProductVariants({
    productId: params.id,
    productSku: existing.sku as string,
    submitted: body.variants,
    actorId: admin.id,
    operationKey: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
    forceZeroOpeningStock: Boolean(brandRow?.is_mahaly_partner),
  });
  if (!variantsResult.ok) {
    return NextResponse.json({ error: `Product updated. However, ${variantsResult.error}` }, { status: 500 });
  }

  const colorImagesResult = await replaceProductColorImages({ productId: params.id, colorImages: body.colorImages });
  if (!colorImagesResult.ok) {
    return NextResponse.json({ error: `Product updated. However, ${colorImagesResult.error}` }, { status: 500 });
  }
  const mediaResult = await replaceProductMedia({ productId: params.id, coverUrl: body.image, galleryUrls: body.images ?? [], colorImages: body.colorImages });
  if (!mediaResult.ok) return NextResponse.json({ error: `Product updated. However, ${mediaResult.error}` }, { status: 500 });

  const variants = await loadProductVariants(params.id);

  await checkAndNotifyWishlistPriceDrop(
    params.id,
    { discountPercent: existing.discount_percent, discountEndsAt: existing.discount_ends_at },
    {
      discountPercent: body.discountPercent ?? null,
      discountEndsAt: body.discountEndsAt ?? null,
      price: body.price,
      name: body.name,
      image: body.image,
      currency: body.currency,
    }
  );

  const notifyMeta = {
    entityId: params.id,
    entityIdLabel: "Product ID",
    actorLabel: admin.email ?? admin.id,
    detailLabel: "Brand",
  };
  if (previousStatus !== body.status) {
    if (body.status === "published") {
      await notify("product_published", `Product published: ${body.name}`, existing.brand_name, notifyMeta);
    } else if (body.status === "archived") {
      const stockWarning = await getPartnerStockWarning(params.id, existing.brand_id);
      await notify("product_archived", `Product archived: ${body.name}`, [existing.brand_name, stockWarning].filter(Boolean).join("\n\n"), notifyMeta);
    } else {
      await notify("product_updated", `Product updated: ${body.name}`, existing.brand_name, notifyMeta);
    }
  } else {
    await notify("product_updated", `Product updated: ${body.name}`, existing.brand_name, notifyMeta);
  }

  const variantChanges = diffVariantList(existingVariants, body.variants);
  const { variants: _variants, ...bodyForDiff } = body;
  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "product",
    entityId: params.id,
    action: previousStatus !== body.status ? "status_change" : "update",
    before: existing,
    after: { ...bodyForDiff, Variants: variantChanges || undefined },
  });

  return NextResponse.json({ id: params.id, variants });
}

// The old DELETE handler here did a raw, unguarded `supabaseAdmin.from(
// "products").delete()` — no dependency checks (a real FK-blocked delete
// would just bubble up as a generic 500), no per-row success verification
// (Supabase's .delete() doesn't error on zero matched rows, so a delete
// against an already-gone product still logged a "delete" audit entry and
// reported {ok:true}). Replaced entirely by the automatic deletion-schedule
// flow (app/api/admin/products/[id]/deletion-schedule/route.ts, and its
// brand-portal equivalent) and the emergency hide action
// (app/api/admin/products/[id]/emergency-hide/route.ts), both routed
// through the canonical, transaction-safe lifecycle RPCs in
// lib/admin/productDeletion.ts. There is intentionally no direct
// "DELETE this product" admin route anymore — every permanent deletion
// must go through the database's own eligibility check (immutable order/
// inventory/warehouse/review history) via schedule_product_deletion /
// execute_due_product_deletions, never a human approval step.
