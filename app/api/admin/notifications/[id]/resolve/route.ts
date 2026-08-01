import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { replaceProductColorImages, replaceProductOptionSelections, syncProductVariants } from "@/lib/admin/variantPersistence";
import type { ProductVariant } from "@/types";
import type { ProductOptionSelectionsSnapshot } from "@/lib/admin/loadProductOptionSelections";
import { safeErrorResponse } from "@/lib/apiError";

interface BeforeProductSnapshot {
  id: string;
  sku: string;
  name: string;
  audience: string;
  product_type_id: string;
  collection_id: string | null;
  material: string | null;
  fit: string | null;
  price: number;
  discount_percent: number | null;
  discount_ends_at: string | null;
  currency: "USD" | "EGP";
  image: string;
  images: string[];
  description: string;
  details: string[];
  care_instructions: string[];
  shipping_returns: string;
  model_height: string | null;
  model_wearing: string | null;
  is_new: boolean;
  default_low_stock_threshold: number;
  status: string;
  variants?: ProductVariant[];
  optionSelections?: ProductOptionSelectionsSnapshot;
  colorImages?: Record<string, string>;
}

// Instant-Publish's admin side: a brand's create/update/archive already
// applied live — this only ever runs afterward, from the notification the
// write path attached itself to. "Approve" is a no-op (the change already
// happened); "Revert" undoes it using the exact before-snapshot the audit
// log entry captured at write time.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const decision = body.decision;
  if (decision !== "approve" && decision !== "revert") {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const { data: notification } = await supabaseAdmin
    .from("notifications")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!notification) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }
  if (notification.resolution !== "pending") {
    return NextResponse.json({ error: "Already resolved" }, { status: 400 });
  }

  const actorLabel = admin.email ?? admin.id;
  const nowIso = new Date().toISOString();

  if (decision === "approve") {
    const { error } = await supabaseAdmin
      .from("notifications")
      .update({ resolution: "approved", read: true })
      .eq("id", params.id);
    if (error) {
      return safeErrorResponse("admin.notifications.resolve.approve", error);
    }
    if (notification.related_entity_type === "product" && notification.related_entity_id) {
      await supabaseAdmin
        .from("products")
        .update({ reviewed_by: admin.id, reviewed_at: nowIso })
        .eq("id", notification.related_entity_id);
    }
    return NextResponse.json({ ok: true });
  }

  // decision === "revert"
  if (!notification.audit_log_id || notification.related_entity_type !== "product") {
    return NextResponse.json({ error: "Nothing to revert" }, { status: 400 });
  }

  const { data: auditEntry } = await supabaseAdmin
    .from("audit_logs")
    .select("action, before_value, entity_id, brand_slug")
    .eq("id", notification.audit_log_id)
    .maybeSingle();
  if (!auditEntry) {
    return NextResponse.json({ error: "Original change record not found" }, { status: 404 });
  }

  const productId = auditEntry.entity_id;

  if (auditEntry.action === "create") {
    // Nothing existed before — reverting a create means taking the new
    // product back off the storefront.
    const { error } = await supabaseAdmin
      .from("products")
      .update({ status: "archived", reviewed_by: admin.id, reviewed_at: nowIso })
      .eq("id", productId);
    if (error) {
      return safeErrorResponse("admin.notifications.resolve.revert-create", error);
    }
  } else if (auditEntry.action === "update") {
    const before = auditEntry.before_value as BeforeProductSnapshot;
    const { variants, optionSelections, colorImages, ...productFields } = before;

    // brand_id/brand_slug/brand_name and sku are never part of this update
    // — both are immutable after creation, so a revert can never change
    // them even though the before-snapshot technically still has them.
    const { error } = await supabaseAdmin
      .from("products")
      .update({
        name: productFields.name,
        audience: productFields.audience,
        product_type_id: productFields.product_type_id,
        collection_id: productFields.collection_id,
        material: productFields.material,
        fit: productFields.fit,
        price: productFields.price,
        discount_percent: productFields.discount_percent,
        discount_ends_at: productFields.discount_ends_at,
        currency: productFields.currency,
        image: productFields.image,
        images: productFields.images,
        description: productFields.description,
        details: productFields.details,
        care_instructions: productFields.care_instructions,
        shipping_returns: productFields.shipping_returns,
        model_height: productFields.model_height,
        model_wearing: productFields.model_wearing,
        is_new: productFields.is_new,
        default_low_stock_threshold: productFields.default_low_stock_threshold,
        status: "published",
        reviewed_by: admin.id,
        reviewed_at: nowIso,
      })
      .eq("id", productId);
    if (error) {
      return safeErrorResponse("admin.notifications.resolve.revert-update", error);
    }

    // Restore the option selections exactly as they stood before the edit.
    if (optionSelections) {
      const optionsResult = await replaceProductOptionSelections({
        productId,
        optionTypeIdsInOrder: optionSelections.optionTypeIdsInOrder,
        valueIdsByOptionType: new Map(Object.entries(optionSelections.valueIdsByOptionType)),
      });
      if (!optionsResult.ok) {
        return NextResponse.json(
          { error: `Reverted product fields, but restoring options failed: ${optionsResult.error}` },
          { status: 500 }
        );
      }
    }

    // Restore the variant set exactly as it stood before the edit — same
    // safe-regen logic the normal edit path uses, so any variant that's
    // unchanged (by combo key) keeps its id/SKU/order history intact.
    if (variants) {
      const variantsResult = await syncProductVariants({
        productId,
        productSku: productFields.sku,
        submitted: variants.map((v) => ({
          optionValueIds: v.optionValues.map((o) => o.optionValueId),
          quantity: v.quantity,
          variantPrice: v.variantPrice ?? null,
          lowStockThresholdOverride: v.lowStockThresholdOverride ?? null,
          sellingStatus: v.sellingStatus,
        })),
        actorId: admin.id,
        operationKey: `notification-revert:${params.id}`,
      });
      if (!variantsResult.ok) {
        return NextResponse.json(
          { error: `Reverted product fields, but restoring variants failed: ${variantsResult.error}` },
          { status: 500 }
        );
      }
    }

    if (colorImages) {
      const colorImagesResult = await replaceProductColorImages({ productId, colorImages });
      if (!colorImagesResult.ok) {
        return NextResponse.json(
          { error: `Reverted product fields, but restoring color images failed: ${colorImagesResult.error}` },
          { status: 500 }
        );
      }
    }
  } else if (auditEntry.action === "archive") {
    const { error } = await supabaseAdmin
      .from("products")
      .update({ status: "published", reviewed_by: admin.id, reviewed_at: nowIso })
      .eq("id", productId);
    if (error) {
      return safeErrorResponse("admin.notifications.resolve.revert-archive", error);
    }
  } else {
    return NextResponse.json({ error: "This change type can't be reverted" }, { status: 400 });
  }

  await logAudit({
    actorId: admin.id,
    actorLabel,
    entityType: "product",
    entityId: productId,
    action: "revert",
    before: auditEntry.before_value,
    brandSlug: auditEntry.brand_slug ?? undefined,
  });

  const { error: resolveError } = await supabaseAdmin
    .from("notifications")
    .update({ resolution: "reverted", read: true })
    .eq("id", params.id);
  if (resolveError) {
    return safeErrorResponse("admin.notifications.resolve.finalize", resolveError);
  }

  await notify("product_updated", `Change reverted by admin`, "", {
    entityId: productId,
    entityIdLabel: "Product ID",
    actorLabel,
  });

  return NextResponse.json({ ok: true });
}
