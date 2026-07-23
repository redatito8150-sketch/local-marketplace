import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { deriveLegacyFieldsFromVariants } from "@/lib/admin/deriveFromVariants";
import { findDuplicateSku } from "@/lib/admin/checkDuplicateSku";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
import { describeProductUpdate, describeProductArchive } from "@/lib/admin/describeProductChange";
import {
  buildProductPersistencePayload,
  buildVariantPersistencePayload,
} from "@/lib/admin/productPersistence";
import { checkRateLimit } from "@/lib/rateLimit";

async function loadOwnedProduct(id: string, brandSlug: string) {
  const { data } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("brand_slug", brandSlug)
    .maybeSingle();
  return data;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const owner = await requireBrandOwner();
  if (!owner || owner.isImpersonating || !owner.brandSlug) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`brand-portal-product-edit:${owner.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const existing = await loadOwnedProduct(params.id, owner.brandSlug);
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const body = await request.json();

  // Lightweight instant on/off switch — no review, no full-form
  // validation, available to owner and assistant alike. Independent of
  // everything below.
  if (body.action === "toggle-pause") {
    const paused = Boolean(body.pausedByBrand);
    const { error } = await supabaseAdmin
      .from("products")
      .update({ paused_by_brand: paused })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to update: ${error.message}` },
        { status: 500 }
      );
    }

    await logAudit({
      actorId: owner.user.id,
      actorLabel: owner.user.email ?? owner.user.id,
      entityType: "product",
      entityId: params.id,
      action: paused ? "pause" : "unpause",
      before: { pausedByBrand: existing.paused_by_brand },
      after: { pausedByBrand: paused },
      brandSlug: owner.brandSlug,
    });
    await notify(
      "product_updated",
      `${paused ? "Paused" : "Unpaused"}: ${existing.name}`,
      owner.brandName ?? "",
      {
        entityId: params.id,
        entityIdLabel: "Product ID",
        actorLabel: owner.user.email ?? owner.user.id,
        detailLabel: "Brand",
      }
    );

    return NextResponse.json({ ok: true });
  }

  // Instant-Publish: a full product-form submission applies straight to the
  // live columns — no more staging in pending_changes. The audit log's
  // `before` snapshot (product row + its variants) is what a later admin
  // Revert restores, so it's captured in full here rather than relying on
  // partial diff data.
  const productBody = body as ProductInput;
  productBody.brandSlug = owner.brandSlug;
  productBody.brandName = owner.brandName ?? productBody.brandName;

  const validationError = validateProductInput(productBody);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const duplicateSku = await findDuplicateSku(productBody.sku, productBody.variants, params.id);
  if (duplicateSku) {
    return NextResponse.json(
      { error: `SKU "${duplicateSku}" is already used by another product` },
      { status: 400 }
    );
  }

  const { data: existingVariants } = await supabaseAdmin
    .from("product_variants")
    .select("*")
    .eq("product_id", params.id);

  const legacy = deriveLegacyFieldsFromVariants(
    productBody.variants,
    productBody.colors,
    productBody.trackInventory
  );

  const productPayload = buildProductPersistencePayload(productBody, legacy, {
    brandSlug: owner.brandSlug,
    status: "published",
    publishDate: existing.publish_date ?? new Date().toISOString(),
    submittedBy: owner.user.id,
    clearReviewState: true,
  });
  // Featured merchandising remains an admin-only decision.
  delete productPayload.featured;
  productPayload.sku ||= params.id;
  const { error } = await supabaseAdmin.rpc("replace_product_with_variants", {
    p_product_id: params.id,
    p_product: productPayload,
    p_variants: buildVariantPersistencePayload(productBody),
  });

  if (error) {
    return NextResponse.json(
      { error: `Failed to save edit: ${error.message}` },
      { status: 500 }
    );
  }

  const auditLogId = await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "product",
    entityId: params.id,
    action: "update",
    before: { ...existing, variants: existingVariants ?? [] },
    after: productBody,
    brandSlug: owner.brandSlug,
  });

  await notify(
    "product_updated",
    `Product edited: ${productBody.name}`,
    describeProductUpdate(existing, productBody),
    {
      relatedEntityType: "product",
      relatedEntityId: params.id,
      auditLogId,
      actorLabel: owner.user.email ?? owner.user.id,
      detailLabel: "Before → After",
    }
  );

  return NextResponse.json({ id: params.id });
}

// Instant-Publish: removes the product from the storefront immediately
// (archived, not hard-deleted — a revertible action, unlike the old
// deletion-request gate). Product ids are reused as URL slugs elsewhere,
// so archiving instead of deleting also means a later "un-revert" doesn't
// need to regenerate a fresh id.
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const owner = await requireBrandOwner();
  if (!owner || owner.isImpersonating || !owner.brandSlug) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`brand-portal-product-delete:${owner.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const existing = await loadOwnedProduct(params.id, owner.brandSlug);
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("products")
    .update({ status: "archived" })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to remove product: ${error.message}` },
      { status: 500 }
    );
  }

  const auditLogId = await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "product",
    entityId: params.id,
    action: "archive",
    before: existing,
    brandSlug: owner.brandSlug,
  });

  await notify(
    "product_archived",
    `Product removed: ${existing.name}`,
    describeProductArchive(existing),
    {
      relatedEntityType: "product",
      relatedEntityId: params.id,
      auditLogId,
      actorLabel: owner.user.email ?? owner.user.id,
    }
  );

  return NextResponse.json({ ok: true });
}
