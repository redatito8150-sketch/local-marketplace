import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { deriveLegacyFieldsFromVariants } from "@/lib/admin/deriveFromVariants";
import { findDuplicateSku } from "@/lib/admin/checkDuplicateSku";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
import {
  buildProductPersistencePayload,
  buildVariantPersistencePayload,
} from "@/lib/admin/productPersistence";

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

  const productPayload = buildProductPersistencePayload(body, legacy);
  productPayload.sku ||= params.id;
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
