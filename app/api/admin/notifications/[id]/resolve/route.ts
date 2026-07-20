import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

interface BeforeProductSnapshot {
  id: string;
  name: string;
  brand_name: string;
  brand_slug: string | null;
  category: string | null;
  product_category: string | null;
  product_type: string | null;
  collection: string | null;
  material: string | null;
  fit: string | null;
  price: number;
  compare_at_price: number | null;
  currency: "USD" | "EGP";
  image: string;
  images: string[];
  colors: unknown;
  sizes: string[];
  description: string;
  details: string[];
  care_instructions: string[];
  shipping_returns: string;
  model_height: string | null;
  model_wearing: string | null;
  sku: string;
  in_stock: boolean;
  is_new: boolean;
  is_unisex: boolean;
  unavailable_sizes: string[];
  track_inventory: boolean;
  status: string;
  variants?: {
    color: string | null;
    size: string | null;
    sku: string | null;
    quantity: number;
    low_stock_threshold: number;
    price_override: number | null;
    availability_status: string;
  }[];
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
      return NextResponse.json({ error: error.message }, { status: 500 });
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (auditEntry.action === "update") {
    const before = auditEntry.before_value as BeforeProductSnapshot;
    const { variants, ...productFields } = before;

    const { error } = await supabaseAdmin
      .from("products")
      .update({
        name: productFields.name,
        brand_name: productFields.brand_name,
        brand_slug: productFields.brand_slug,
        category: productFields.category,
        product_category: productFields.product_category,
        product_type: productFields.product_type,
        collection: productFields.collection,
        material: productFields.material,
        fit: productFields.fit,
        price: productFields.price,
        compare_at_price: productFields.compare_at_price,
        currency: productFields.currency,
        image: productFields.image,
        images: productFields.images,
        colors: productFields.colors,
        sizes: productFields.sizes,
        description: productFields.description,
        details: productFields.details,
        care_instructions: productFields.care_instructions,
        shipping_returns: productFields.shipping_returns,
        model_height: productFields.model_height,
        model_wearing: productFields.model_wearing,
        sku: productFields.sku,
        in_stock: productFields.in_stock,
        is_new: productFields.is_new,
        is_unisex: productFields.is_unisex,
        unavailable_sizes: productFields.unavailable_sizes,
        track_inventory: productFields.track_inventory,
        status: "published",
        reviewed_by: admin.id,
        reviewed_at: nowIso,
      })
      .eq("id", productId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Restore the variant set exactly as it stood before the edit.
    const { error: deleteError } = await supabaseAdmin
      .from("product_variants")
      .delete()
      .eq("product_id", productId);
    if (deleteError) {
      return NextResponse.json(
        { error: `Reverted product fields, but restoring variants failed: ${deleteError.message}` },
        { status: 500 }
      );
    }
    if (variants && variants.length > 0) {
      const { error: variantsError } = await supabaseAdmin.from("product_variants").insert(
        variants.map((v) => ({
          product_id: productId,
          color: v.color,
          size: v.size,
          sku: v.sku,
          quantity: v.quantity,
          low_stock_threshold: v.low_stock_threshold,
          price_override: v.price_override,
          availability_status: v.availability_status,
        }))
      );
      if (variantsError) {
        return NextResponse.json(
          { error: `Reverted product fields, but restoring variants failed: ${variantsError.message}` },
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
      return NextResponse.json({ error: error.message }, { status: 500 });
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
    return NextResponse.json({ error: resolveError.message }, { status: 500 });
  }

  await notify("product_updated", `Change reverted by admin`, "", {
    entityId: productId,
    entityIdLabel: "Product ID",
    actorLabel,
  });

  return NextResponse.json({ ok: true });
}
