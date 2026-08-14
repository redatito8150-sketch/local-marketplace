import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateProductInput, type ProductInput } from "@/lib/admin/productValidation";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
import { diffVariantList } from "@/lib/auditDiff";
import { describeProductUpdate, describeProductArchive } from "@/lib/admin/describeProductChange";
import { resolveTaxonomyLeaf } from "@/lib/admin/resolveTaxonomyLeaf";
import { resolveCollectionOwnership } from "@/lib/admin/resolveCollectionOwnership";
import {
  buildProductPersistencePayload,
} from "@/lib/admin/productPersistence";
import {
  syncProductVariants,
  replaceProductOptionSelections,
  replaceProductColorImages,
  replaceProductMedia,
} from "@/lib/admin/variantPersistence";
import { loadProductVariants } from "@/lib/admin/loadProductVariants";
import { loadProductColorImages, loadProductOptionSelections } from "@/lib/admin/loadProductOptionSelections";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";
import { checkAndNotifyWishlistPriceDrop } from "@/lib/wishlistPriceDrop";
import { getPartnerStockWarning } from "@/lib/admin/warehouseArchiveWarning";
import { archiveProduct } from "@/lib/admin/productDeletion";

async function loadOwnedProduct(id: string, brandId: string) {
  const { data } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brandId)
    .maybeSingle();
  return data;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner || owner.isImpersonating || !owner.brandId) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`brand-portal-product-edit:${owner.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const existing = await loadOwnedProduct(params.id, owner.brandId);
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
      return safeErrorResponse("brand-portal.products.toggle-pause", error, "Failed to update");
    }

    await logAudit({
      actorId: owner.user.id,
      actorLabel: owner.user.email ?? owner.user.id,
      entityType: "product",
      entityId: params.id,
      action: paused ? "pause" : "unpause",
      before: { pausedByBrand: existing.paused_by_brand },
      after: { pausedByBrand: paused },
      brandSlug: owner.brandSlug ?? undefined,
    });
    await notify(
      "product_updated",
      `${paused ? "Paused" : "Unpaused"}: ${existing.name}`,
      owner.brandName ?? "",
      {
        relatedEntityType: "product",
        relatedEntityId: params.id,
        entityIdLabel: "Product ID",
        actorLabel: owner.user.email ?? owner.user.id,
        detailLabel: "Brand",
      }
    );

    return NextResponse.json({ ok: true });
  }

  // Lightweight quick-action from the products list row (replaces the old
  // Pause toggle there) — a published product is already complete (it had
  // to be, to get published), so archiving it from here needs no
  // additional completeness check, unlike the full editor's own Archive
  // button. No review, available to owner and assistant alike.
  if (body.action === "archive") {
    const result = await archiveProduct(params.id, owner.brandId, owner.user.id, owner.user.email ?? owner.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "PRODUCT_NOT_OWNED" ? 403 : result.code === "PRODUCT_NOT_FOUND" ? 404 : 409 });
    }

    const auditLogId = await logAudit({
      actorId: owner.user.id,
      actorLabel: owner.user.email ?? owner.user.id,
      entityType: "product",
      entityId: params.id,
      action: "archive",
      before: existing,
      brandSlug: owner.brandSlug ?? undefined,
    });
    const stockWarning = await getPartnerStockWarning(params.id, owner.brandId);
    await notify(
      "product_archived",
      `Archived: ${existing.name}`,
      [describeProductArchive(existing), stockWarning].filter(Boolean).join("\n\n"),
      {
        relatedEntityType: "product",
        relatedEntityId: params.id,
        auditLogId,
        actorLabel: owner.user.email ?? owner.user.id,
      }
    );

    return NextResponse.json({ ok: true, warning: stockWarning ?? undefined });
  }

  // Instant-Publish: a full product-form submission applies straight to the
  // live columns — no more staging in pending_changes. The audit log's
  // `before` snapshot (product row + its variants) is kept in full so the
  // Audit Log page can always show exactly what changed, field by field.
  const productBody = body as ProductInput;

  // SECOND CORRECTIVE PASS: blocks the full archived -> anything transition
  // (not just -> published) — see the matching comment in
  // app/api/admin/products/[id]/route.ts for the two-step bypass this
  // closes. Only restore_product may move a product out of "archived",
  // backed by the products_enforce_archived_transition DB trigger.
  if (existing.status === "archived" && productBody.status !== "archived") {
    return NextResponse.json(
      { error: "This product is archived. Use Restore product from the products list — editing status directly is not allowed for archived products." },
      { status: 409 }
    );
  }

  // Brand is immutable after creation — whatever the client sends is
  // ignored, always the caller's own brand.
  productBody.brandId = owner.brandId;
  // Same "never trust the client" rule — lets validateProductSections
  // skip the "needs stock > 0" publish requirement for a partner brand,
  // whose variants always start at 0 live quantity by design (see
  // forceZeroOpeningStock below).
  productBody.isPartnerBrand = owner.isMahalyPartner;
  // Brand-portal writes draft, published, or archived from the editor's
  // own Save as Draft / Archive / Publish actions — archiving here is
  // distinct from the DELETE action below (a quick "remove this" shortcut
  // regardless of completeness); this path is gated by the same
  // completeness bar as publishing (validateProductSections below).
  productBody.status = productBody.status === "draft" || productBody.status === "archived" ? productBody.status : "published";

  const validationError = validateProductInput(productBody);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const taxonomy = await resolveTaxonomyLeaf(productBody.productTypeId);
  if (!taxonomy.valid) {
    return NextResponse.json({ error: taxonomy.error }, { status: 400 });
  }
  productBody.productTypeId = taxonomy.productTypeId;

  const collectionCheck = await resolveCollectionOwnership(productBody.collectionId, owner.brandId);
  if (!collectionCheck.valid) {
    return NextResponse.json({ error: collectionCheck.error }, { status: 400 });
  }

  const existingVariants = await loadProductVariants(params.id);
  const existingOptionSelections = await loadProductOptionSelections(params.id);
  const existingColorImages = await loadProductColorImages(params.id);

  const productPayload = buildProductPersistencePayload(productBody, {
    previousPublishDate: existing.publish_date,
    previousStatus: existing.status,
    submittedBy: owner.user.id,
    clearReviewState: true,
  });
  // Featured merchandising remains an admin-only decision. Brand identity
  // is immutable after creation.
  delete productPayload.featured;
  delete productPayload.brand_id;

  const { error } = await supabaseAdmin.from("products").update(productPayload).eq("id", params.id);
  if (error) {
    return safeErrorResponse("brand-portal.products.save-edit", error, "Failed to save edit");
  }

  const optionsResult = await replaceProductOptionSelections({
    productId: params.id,
    optionTypeIdsInOrder: productBody.optionTypeIds,
    valueIdsByOptionType: new Map(Object.entries(productBody.valueIdsByOptionType)),
  });
  if (!optionsResult.ok) {
    return NextResponse.json({ error: `Product updated. However, ${optionsResult.error}` }, { status: 500 });
  }

  const variantsResult = await syncProductVariants({
    productId: params.id,
    productSku: existing.sku as string,
    submitted: productBody.variants,
    actorId: owner.user.id,
    operationKey: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
    forceZeroOpeningStock: owner.isMahalyPartner,
  });
  if (!variantsResult.ok) {
    return NextResponse.json({ error: `Product updated. However, ${variantsResult.error}` }, { status: 500 });
  }

  const colorImagesResult = await replaceProductColorImages({
    productId: params.id,
    colorImages: productBody.colorImages,
  });
  if (!colorImagesResult.ok) {
    return NextResponse.json({ error: `Product updated. However, ${colorImagesResult.error}` }, { status: 500 });
  }
  const mediaResult = await replaceProductMedia({ productId: params.id, coverUrl: productBody.image, galleryUrls: productBody.images ?? [], colorImages: productBody.colorImages });
  if (!mediaResult.ok) return NextResponse.json({ error: `Product updated. However, ${mediaResult.error}` }, { status: 500 });

  const variants = await loadProductVariants(params.id);

  await checkAndNotifyWishlistPriceDrop(
    params.id,
    { discountPercent: existing.discount_percent, discountEndsAt: existing.discount_ends_at },
    {
      discountPercent: productBody.discountPercent ?? null,
      discountEndsAt: productBody.discountEndsAt ?? null,
      price: productBody.price,
      name: productBody.name,
      image: productBody.image,
      currency: productBody.currency,
    }
  );

  // Variants get their own SKU-keyed diff (see diffVariantList) instead of
  // being blindly blob-compared alongside the product's own fields — the
  // two sides don't even share a shape (a saved ProductVariant vs. the
  // form's VariantRowInput), so a raw compare would always "look changed."
  const variantChanges = diffVariantList(existingVariants, productBody.variants);
  const { variants: _variants, ...productBodyForDiff } = productBody;
  const auditLogId = await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "product",
    entityId: params.id,
    action: "update",
    before: { ...existing, optionSelections: existingOptionSelections, colorImages: existingColorImages },
    after: { ...productBodyForDiff, Variants: variantChanges || undefined },
    brandSlug: owner.brandSlug ?? undefined,
  });

  // Notify admin whenever this touches something actually live — going
  // published for the first time, editing while already published, or
  // un-publishing back to draft. A draft-to-draft save has no live
  // consequence to review, so it stays quiet.
  if (existing.status === "published" || productBody.status === "published") {
    const stockWarning = productBody.status === "archived" ? await getPartnerStockWarning(params.id, owner.brandId) : null;
    await notify(
      "product_updated",
      `Product edited: ${productBody.name}`,
      [describeProductUpdate(existing, productBody), stockWarning].filter(Boolean).join("\n\n"),
      {
        relatedEntityType: "product",
        relatedEntityId: params.id,
        auditLogId,
        actorLabel: owner.user.email ?? owner.user.id,
        detailLabel: "Before → After",
      }
    );
  }

  return NextResponse.json({ id: params.id, variants });
}

// The old DELETE handler here only ever archived the product (never
// actually deleted anything, despite the Brand Portal UI calling it
// "Request deletion") — replaced by the dedicated, honestly-named actions
// in app/api/brand-portal/products/[id]/deletion/route.ts (archive /
// restore / delete-draft / request / cancel), which route through the
// canonical, transaction-safe lifecycle RPCs instead of a raw column
// update. HTTP DELETE is intentionally not used on this resource anymore —
// see that file's header comment for the full rationale.
