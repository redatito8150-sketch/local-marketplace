import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
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

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: ProductInput = await request.json();
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
      brand_slug: body.brandSlug || null,
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
      featured: body.featured,
      status: body.status,
      publish_date: body.publishDate ?? null,
    });

    if (!error) {
      inserted = true;
    } else if (error.code !== "23505" /* unique_violation */) {
      return NextResponse.json(
        { error: `Failed to create product: ${error.message}` },
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
        { error: `Product created, but saving variants failed: ${variantsError.message}` },
        { status: 500 }
      );
    }
  }

  await notify(
    body.status === "published" ? "product_published" : "product_created",
    body.status === "published" ? `Product published: ${body.name}` : `Product created: ${body.name}`,
    body.brandName
  );

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "product",
    entityId: id,
    action: "create",
    after: body,
  });

  return NextResponse.json({ id });
}
