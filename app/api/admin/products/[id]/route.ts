import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { deriveLegacyFieldsFromVariants } from "@/lib/admin/deriveFromVariants";
import { findDuplicateSku } from "@/lib/admin/checkDuplicateSku";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
import { resolveTaxonomyLeaf } from "@/lib/admin/resolveTaxonomyLeaf";
import { resolveCollectionOwnership } from "@/lib/admin/resolveCollectionOwnership";
import {
  buildProductPersistencePayload,
  buildVariantPersistencePayload,
  deriveCategoryFromAudience,
} from "@/lib/admin/productPersistence";

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

  const body: ProductInput = await request.json();
  // Brand is immutable after creation (SKU ownership, collections, and
  // audit history all key off it) — whatever the client sends is ignored.
  body.brandSlug = existing.brand_slug ?? undefined;
  body.brandName = existing.brand_name;

  const validationError = validateProductInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const taxonomy = await resolveTaxonomyLeaf(body.productTypeId);
  if (!taxonomy.valid) {
    return NextResponse.json({ error: taxonomy.error }, { status: 400 });
  }
  body.productCategory = taxonomy.productCategory ?? body.productCategory;
  body.productType = taxonomy.productType ?? body.productType;
  body.productTypeId = taxonomy.productTypeId ?? body.productTypeId;

  const collectionCheck = await resolveCollectionOwnership(body.collectionId, body.brandSlug);
  if (!collectionCheck.valid) {
    return NextResponse.json({ error: collectionCheck.error }, { status: 400 });
  }

  // Audience present -> derive category/is_unisex from it. Absent -> keep
  // whatever the product already had (an edit that doesn't touch Audience
  // must never blank out the existing shop-category placement).
  if (body.audience) {
    const derived = deriveCategoryFromAudience(body.audience);
    body.category = derived.category ?? body.category;
    body.isUnisex = derived.isUnisex;
  } else {
    body.category = existing.category ?? undefined;
    body.isUnisex = Boolean(existing.is_unisex);
  }

  const duplicateSku = await findDuplicateSku(undefined, body.variants, params.id);
  if (duplicateSku) {
    return NextResponse.json(
      { error: `SKU "${duplicateSku}" is already used by another product` },
      { status: 400 }
    );
  }

  const legacy = deriveLegacyFieldsFromVariants(body.variants, body.colors, body.trackInventory);

  const productPayload = buildProductPersistencePayload(body, legacy);
  // The SKU never changes on edit, regardless of what was submitted.
  productPayload.sku = existing.sku;
  const { error } = await supabaseAdmin.rpc("replace_product_with_variants", {
    p_product_id: params.id,
    p_product: productPayload,
    p_variants: buildVariantPersistencePayload(body),
  });

  if (error) {
    return NextResponse.json(
      { error: `Failed to update product: ${error.message}` },
      { status: 500 }
    );
  }

  // Product and variants were committed by one database transaction.
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
