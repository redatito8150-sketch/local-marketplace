import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { deriveLegacyFieldsFromVariants } from "@/lib/admin/deriveFromVariants";
import { findDuplicateSku } from "@/lib/admin/checkDuplicateSku";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";

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

// New products a brand owner/assistant submits are never live on save —
// they always land as status: "pending_review" (Phase 0's storefront
// filter keeps them off the public site) until an admin approves them in
// the review queue (Phase 3). An admin viewing this brand's portal
// (isImpersonating) never creates on the brand's behalf — only the real
// owner/assistant does.
export async function POST(request: NextRequest) {
  const owner = await requireBrandOwner();
  if (!owner || owner.isImpersonating || !owner.brandSlug) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: ProductInput = await request.json();
  // Never trust the client for which brand this belongs to, even though
  // the form locks it — force it server-side to the caller's own brand.
  body.brandSlug = owner.brandSlug;
  body.brandName = owner.brandName ?? body.brandName;

  const validationError = validateProductInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const duplicateSku = await findDuplicateSku(body.sku, body.variants);
  if (duplicateSku) {
    return NextResponse.json(
      { error: `SKU "${duplicateSku}" is already used by another product` },
      { status: 400 }
    );
  }

  const legacy = deriveLegacyFieldsFromVariants(body.variants, body.colors, body.trackInventory);

  const baseSlug = slugify(body.name) || "product";
  let id = "";
  let inserted = false;

  for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
    id = `${baseSlug}-${randomSuffix()}`;
    const { error } = await supabaseAdmin.from("products").insert({
      id,
      name: body.name,
      brand_name: body.brandName,
      brand_slug: body.brandSlug,
      category: body.category || null,
      product_category: body.productCategory || null,
      product_type: body.productType || null,
      collection: body.collection || null,
      material: body.material || null,
      fit: body.fit || null,
      price: body.price,
      compare_at_price: body.compareAtPrice ?? null,
      currency: body.currency,
      image: body.image,
      images: body.images?.length ? body.images : [body.image],
      colors: legacy.colors,
      sizes: legacy.sizes,
      description: body.description,
      details: body.details,
      care_instructions: body.careInstructions,
      shipping_returns: body.shippingReturns,
      model_height: body.modelHeight || null,
      model_wearing: body.modelWearing || null,
      sku: body.sku?.trim() || id,
      in_stock: legacy.inStock,
      is_new: body.isNew,
      is_unisex: body.isUnisex,
      unavailable_sizes: legacy.unavailableSizes,
      track_inventory: body.trackInventory,
      featured: false,
      status: "pending_review",
      publish_date: null,
      submitted_by: owner.user.id,
    });

    if (!error) {
      inserted = true;
    } else if (error.code !== "23505" /* unique_violation */) {
      return NextResponse.json(
        { error: `Failed to submit product: ${error.message}` },
        { status: 500 }
      );
    }
  }

  if (!inserted) {
    return NextResponse.json(
      { error: "Failed to generate a unique product id, please try again" },
      { status: 500 }
    );
  }

  if (body.variants.length > 0) {
    const { error: variantsError } = await supabaseAdmin.from("product_variants").insert(
      body.variants.map((v) => ({
        product_id: id,
        color: v.color || null,
        size: v.size || null,
        sku: v.sku?.trim() || null,
        quantity: v.quantity,
        low_stock_threshold: v.lowStockThreshold,
        price_override: v.priceOverride ?? null,
        availability_status: v.availabilityStatus,
      }))
    );

    if (variantsError) {
      return NextResponse.json(
        { error: `Product submitted, but saving variants failed: ${variantsError.message}` },
        { status: 500 }
      );
    }
  }

  await notify("product_created", `Product submitted for review: ${body.name}`, body.brandName);

  await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "product",
    entityId: id,
    action: "create",
    after: body,
    brandSlug: owner.brandSlug,
  });

  return NextResponse.json({ id });
}
