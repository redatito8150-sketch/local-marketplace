import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { deriveLegacyFieldsFromVariants } from "@/lib/admin/deriveFromVariants";
import { findDuplicateSku } from "@/lib/admin/checkDuplicateSku";
import { resolveTaxonomyLeaf } from "@/lib/admin/resolveTaxonomyLeaf";
import { resolveCollectionOwnership } from "@/lib/admin/resolveCollectionOwnership";
import { deriveCategoryFromAudience } from "@/lib/admin/productPersistence";
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

  const taxonomy = await resolveTaxonomyLeaf(body.productTypeId);
  if (!taxonomy.valid) {
    return NextResponse.json({ error: taxonomy.error }, { status: 400 });
  }
  // The server-resolved category/type (derived from the taxonomy tree, not
  // trusted from the client) wins whenever a productTypeId was submitted —
  // otherwise body.productCategory/productType pass through unchanged, so
  // saving without touching the new taxonomy selects never loses an
  // existing legacy category.
  body.productCategory = taxonomy.productCategory ?? body.productCategory;
  body.productType = taxonomy.productType ?? body.productType;
  body.productTypeId = taxonomy.productTypeId ?? body.productTypeId;

  if (body.brandSlug) {
    const { data: brandRow } = await supabaseAdmin
      .from("brands")
      .select("slug")
      .eq("slug", body.brandSlug)
      .maybeSingle();
    if (!brandRow) {
      return NextResponse.json({ error: "Selected brand was not found" }, { status: 400 });
    }
  }

  const collectionCheck = await resolveCollectionOwnership(body.collectionId, body.brandSlug);
  if (!collectionCheck.valid) {
    return NextResponse.json({ error: collectionCheck.error }, { status: 400 });
  }

  const { category, isUnisex } = deriveCategoryFromAudience(body.audience);
  body.category = category ?? body.category;
  body.isUnisex = isUnisex;

  const duplicateSku = await findDuplicateSku(body.brandSlug ? undefined : body.sku, body.variants);
  if (duplicateSku) {
    return NextResponse.json(
      { error: `SKU "${duplicateSku}" is already used by another product` },
      { status: 400 }
    );
  }

  // A brand-scoped product's SKU is always server-generated — the client's
  // `sku` field is completely ignored the moment a real brand is selected.
  // Only a legacy brand-less product (category text products predating
  // this taxonomy round) can still fall back to a typed value or the
  // generated product id.
  let generatedSku: string | null = null;
  if (body.brandSlug) {
    const { data: skuValue, error: skuError } = await supabaseAdmin.rpc("next_product_sku", {
      p_brand_slug: body.brandSlug,
    });
    if (skuError || !skuValue) {
      return NextResponse.json(
        {
          error: skuError?.message?.includes("sku_prefix")
            ? "This brand has no SKU prefix configured yet — set one in Brand settings first"
            : "Failed to generate a product SKU",
        },
        { status: 400 }
      );
    }
    generatedSku = skuValue as string;
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
      audience: body.audience || null,
      product_category: body.productCategory || null,
      product_type: body.productType || null,
      product_type_id: body.productTypeId || null,
      collection: body.collection || null,
      collection_id: body.collectionId || null,
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
      sku: generatedSku ?? body.sku?.trim() ?? id,
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
    body.brandName,
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

  return NextResponse.json({ id, sku: generatedSku ?? body.sku?.trim() ?? id });
}
