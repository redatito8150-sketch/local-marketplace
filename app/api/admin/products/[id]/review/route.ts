import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deriveLegacyFieldsFromVariants } from "@/lib/admin/deriveFromVariants";
import type { ProductInput } from "@/lib/admin/productValidation";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";

// Approve/request-changes for both halves of the review queue: a brand-new
// submission (status: pending_review, pending_changes null) and a staged
// edit to an already-published product (status: published, pending_changes
// set). Which one this row is decides which branch runs below.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const decision = body.decision;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (decision !== "approve" && decision !== "request_changes") {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }
  if (decision === "request_changes" && !notes) {
    return NextResponse.json(
      { error: "Notes are required when requesting changes" },
      { status: 400 }
    );
  }

  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const actorLabel = admin.email ?? admin.id;
  const brandSlug = existing.brand_slug ?? undefined;
  const nowIso = new Date().toISOString();

  const isEditReview = existing.status === "published" && Boolean(existing.pending_changes);

  if (isEditReview) {
    const proposed = existing.pending_changes as ProductInput;

    if (decision === "request_changes") {
      const { error } = await supabaseAdmin
        .from("products")
        .update({ review_notes: notes, reviewed_by: admin.id, reviewed_at: nowIso })
        .eq("id", params.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      await logAudit({
        actorId: admin.id,
        actorLabel,
        entityType: "product",
        entityId: params.id,
        action: "request_changes",
        after: { notes },
        brandSlug,
      });
      await notify("product_updated", `Changes requested on edit: ${existing.name}`, notes);
      return NextResponse.json({ ok: true });
    }

    // Approve: merge the staged edit into the live columns and clear the
    // staging fields — same wholesale-variant-replace convention as the
    // admin's own product edit route.
    const legacy = deriveLegacyFieldsFromVariants(
      proposed.variants,
      proposed.colors,
      proposed.trackInventory
    );

    const { error } = await supabaseAdmin
      .from("products")
      .update({
        name: proposed.name,
        brand_name: proposed.brandName,
        brand_slug: proposed.brandSlug || null,
        category: proposed.category || null,
        product_category: proposed.productCategory || null,
        product_type: proposed.productType || null,
        collection: proposed.collection || null,
        material: proposed.material || null,
        fit: proposed.fit || null,
        price: proposed.price,
        compare_at_price: proposed.compareAtPrice ?? null,
        currency: proposed.currency,
        image: proposed.image,
        images: proposed.images?.length ? proposed.images : [proposed.image],
        colors: legacy.colors,
        sizes: legacy.sizes,
        description: proposed.description,
        details: proposed.details,
        care_instructions: proposed.careInstructions,
        shipping_returns: proposed.shippingReturns,
        model_height: proposed.modelHeight || null,
        model_wearing: proposed.modelWearing || null,
        sku: proposed.sku?.trim() || params.id,
        in_stock: legacy.inStock,
        is_new: proposed.isNew,
        is_unisex: proposed.isUnisex,
        unavailable_sizes: legacy.unavailableSizes,
        track_inventory: proposed.trackInventory,
        pending_changes: null,
        review_notes: null,
        reviewed_by: admin.id,
        reviewed_at: nowIso,
      })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to approve edit: ${error.message}` },
        { status: 500 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from("product_variants")
      .delete()
      .eq("product_id", params.id);
    if (deleteError) {
      return NextResponse.json(
        { error: `Edit approved, but clearing old variants failed: ${deleteError.message}` },
        { status: 500 }
      );
    }

    if (proposed.variants?.length) {
      const { error: variantsError } = await supabaseAdmin.from("product_variants").insert(
        proposed.variants.map((v) => ({
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
          { error: `Edit approved, but saving variants failed: ${variantsError.message}` },
          { status: 500 }
        );
      }
    }

    await logAudit({
      actorId: admin.id,
      actorLabel,
      entityType: "product",
      entityId: params.id,
      action: "approve",
      before: existing,
      after: proposed,
      brandSlug,
    });
    await notify("product_updated", `Edit approved: ${proposed.name}`, proposed.brandName);
    return NextResponse.json({ ok: true });
  }

  // New-submission review (status pending_review, nothing staged).
  if (decision === "request_changes") {
    const { error } = await supabaseAdmin
      .from("products")
      .update({
        status: "changes_requested",
        review_notes: notes,
        reviewed_by: admin.id,
        reviewed_at: nowIso,
      })
      .eq("id", params.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAudit({
      actorId: admin.id,
      actorLabel,
      entityType: "product",
      entityId: params.id,
      action: "request_changes",
      before: existing,
      after: { notes },
      brandSlug,
    });
    await notify("product_updated", `Changes requested: ${existing.name}`, notes);
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseAdmin
    .from("products")
    .update({
      status: "published",
      publish_date: existing.publish_date ?? nowIso,
      review_notes: null,
      reviewed_by: admin.id,
      reviewed_at: nowIso,
    })
    .eq("id", params.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    actorId: admin.id,
    actorLabel,
    entityType: "product",
    entityId: params.id,
    action: "approve",
    before: existing,
    brandSlug,
  });
  await notify("product_published", `Product published: ${existing.name}`, existing.brand_name);
  return NextResponse.json({ ok: true });
}
