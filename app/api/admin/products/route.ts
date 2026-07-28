import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { deriveLegacyFieldsFromVariants } from "@/lib/admin/deriveFromVariants";
import { findDuplicateSku } from "@/lib/admin/checkDuplicateSku";
import { resolveTaxonomyLeaf } from "@/lib/admin/resolveTaxonomyLeaf";
import { resolveCollectionOwnership } from "@/lib/admin/resolveCollectionOwnership";
import { buildProductPersistencePayload } from "@/lib/admin/productPersistence";
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
  body.productTypeId = taxonomy.productTypeId;

  const { data: brandRow } = await supabaseAdmin
    .from("brands")
    .select("id, name")
    .eq("id", body.brandId)
    .maybeSingle();
  if (!brandRow) {
    return NextResponse.json({ error: "Selected brand was not found" }, { status: 400 });
  }

  const collectionCheck = await resolveCollectionOwnership(body.collectionId, body.brandId);
  if (!collectionCheck.valid) {
    return NextResponse.json({ error: collectionCheck.error }, { status: 400 });
  }

  const duplicateSku = await findDuplicateSku(body.variants);
  if (duplicateSku) {
    return NextResponse.json(
      { error: `SKU "${duplicateSku}" is already used by another product` },
      { status: 400 }
    );
  }

  // Every product's SKU is always server-generated — the client never
  // supplies or overrides it.
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

  const legacy = deriveLegacyFieldsFromVariants(body.variants, body.colors, body.trackInventory);
  const productPayload = buildProductPersistencePayload(body, legacy);
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

  return NextResponse.json({ id, sku: generatedSku });
}
