import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
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
  // Brand and SKU are immutable after creation — whatever the client
  // sends is ignored, always the existing product's own values.
  body.brandId = existing.brand_id;

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

  const productPayload = buildProductPersistencePayload(body);
  delete productPayload.brand_id; // immutable, never part of an update

  const { error } = await supabaseAdmin.from("products").update(productPayload).eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: `Failed to update product: ${error.message}` }, { status: 500 });
  }

  const optionsResult = await replaceProductOptionSelections({
    productId: params.id,
    optionTypeIdsInOrder: body.optionTypeIds,
    valueIdsByOptionType: new Map(Object.entries(body.valueIdsByOptionType)),
  });
  if (!optionsResult.ok) {
    return NextResponse.json({ error: `Product updated, but ${optionsResult.error}` }, { status: 500 });
  }

  const variantsResult = await syncProductVariants({
    productId: params.id,
    productSku: existing.sku as string,
    submitted: body.variants,
  });
  if (!variantsResult.ok) {
    return NextResponse.json({ error: `Product updated, but ${variantsResult.error}` }, { status: 500 });
  }

  const colorImagesResult = await replaceProductColorImages({ productId: params.id, colorImages: body.colorImages });
  if (!colorImagesResult.ok) {
    return NextResponse.json({ error: `Product updated, but ${colorImagesResult.error}` }, { status: 500 });
  }
  const mediaResult = await replaceProductMedia({ productId: params.id, coverUrl: body.image, galleryUrls: body.images ?? [], colorImages: body.colorImages });
  if (!mediaResult.ok) return NextResponse.json({ error: `Product updated, but ${mediaResult.error}` }, { status: 500 });

  const variants = await loadProductVariants(params.id);

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
      await notify("product_archived", `Product archived: ${body.name}`, existing.brand_name, notifyMeta);
    } else {
      await notify("product_updated", `Product updated: ${body.name}`, existing.brand_name, notifyMeta);
    }
  } else {
    await notify("product_updated", `Product updated: ${body.name}`, existing.brand_name, notifyMeta);
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

  return NextResponse.json({ id: params.id, variants });
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
