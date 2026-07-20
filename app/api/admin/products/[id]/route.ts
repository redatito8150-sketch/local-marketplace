import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { deriveLegacyFieldsFromVariants } from "@/lib/admin/deriveFromVariants";
import { findDuplicateSku } from "@/lib/admin/checkDuplicateSku";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: ProductInput = await request.json();
  const validationError = validateProductInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const duplicateSku = await findDuplicateSku(body.sku, body.variants, params.id);
  if (duplicateSku) {
    return NextResponse.json(
      { error: `SKU "${duplicateSku}" is already used by another product` },
      { status: 400 }
    );
  }

  const legacy = deriveLegacyFieldsFromVariants(body.variants, body.colors, body.trackInventory);

  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  const previousStatus = existing?.status;

  const { error } = await supabaseAdmin
    .from("products")
    .update({
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
      sku: body.sku?.trim() || params.id,
      in_stock: legacy.inStock,
      is_new: body.isNew,
      is_unisex: body.isUnisex,
      unavailable_sizes: legacy.unavailableSizes,
      track_inventory: body.trackInventory,
      featured: body.featured,
      status: body.status,
      publish_date: body.publishDate ?? null,
    })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to update product: ${error.message}` },
      { status: 500 }
    );
  }

  // Full-form save: replace the variant set wholesale rather than diffing
  // individual rows — simpler and correct for "the form is the source of
  // truth for this product's variants on every save."
  const { error: deleteError } = await supabaseAdmin
    .from("product_variants")
    .delete()
    .eq("product_id", params.id);

  if (deleteError) {
    return NextResponse.json(
      { error: `Failed to update variants: ${deleteError.message}` },
      { status: 500 }
    );
  }

  if (body.variants.length > 0) {
    const { error: variantsError } = await supabaseAdmin.from("product_variants").insert(
      body.variants.map((v) => ({
        product_id: params.id,
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
        { error: `Product updated, but saving variants failed: ${variantsError.message}` },
        { status: 500 }
      );
    }
  }

  const notifyMeta = {
    entityId: params.id,
    entityIdLabel: "Product ID",
    actorLabel: admin.email ?? admin.id,
    detailLabel: "Brand",
  };
  if (previousStatus !== body.status) {
    if (body.status === "published") {
      await notify("product_published", `Product published: ${body.name}`, body.brandName, notifyMeta);
    } else if (body.status === "archived") {
      await notify("product_archived", `Product archived: ${body.name}`, body.brandName, notifyMeta);
    } else {
      await notify("product_updated", `Product updated: ${body.name}`, body.brandName, notifyMeta);
    }
  } else {
    await notify("product_updated", `Product updated: ${body.name}`, body.brandName, notifyMeta);
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "product",
    entityId: params.id,
    action: previousStatus !== body.status ? "status_change" : "update",
    before: existing,
    after: body,
  });

  return NextResponse.json({ id: params.id });
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

  const { error } = await supabaseAdmin.from("products").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete product: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "product",
    entityId: params.id,
    action: "delete",
    before: existing,
  });

  return NextResponse.json({ ok: true });
}
