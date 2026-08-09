import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notifyUser } from "@/lib/notify";
import { sendEmail } from "@/lib/email/sendEmail";
import { orderShippedEmail } from "@/lib/email/templates/orderShipped";
import { getOrderForAdmin } from "@/lib/data/admin";

// A brand only ever advances its OWN 'brand_direct' shipment through the
// self-fulfillment handoff — Mahaly still does the actual delivery, but the
// brand is the one packing the order, so it marks "I'm packing it" and
// "I've handed it to the courier" itself rather than waiting on an admin.
// 'mahaly_pool' orders (this brand's items pooled with other partner
// brands', fulfilled straight from Mahaly's own warehouse) are never
// editable here — only admin/staff touch those, same as before.
const ALLOWED_TRANSITIONS: Record<string, string> = {
  paid: "preparing",
  preparing: "shipped",
};

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (typeof status !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const owner = await requireActiveBrandOwner(body?.brandSlug);
  if (!owner || !owner.brandSlug) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status, fulfillment_type, brand_slug, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  // Ownership check happens code-side (not just RLS) — same "verify the
  // caller actually owns the target" precedent as the product-images route.
  if (order.fulfillment_type !== "brand_direct" || order.brand_slug !== owner.brandSlug) {
    return NextResponse.json({ error: "This shipment isn't editable from your brand portal" }, { status: 403 });
  }
  if (ALLOWED_TRANSITIONS[order.status] !== status) {
    return NextResponse.json(
      { error: `Can't move this order from "${order.status}" to "${status}"` },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.rpc("transition_order_status", {
    p_order_id: params.id,
    p_expected_status: order.status,
    p_new_status: status,
    p_actor_id: owner.user.id,
    p_note: null,
  });
  if (error) {
    const code = error.message.split(":")[0]?.trim();
    if (code === "ORDER_STATUS_CONFLICT") {
      return NextResponse.json(
        { error: "The order changed while you were editing it. Refresh and try again." },
        { status: 409 }
      );
    }
    if (code === "ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update order status" }, { status: 400 });
  }

  await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "order",
    entityId: params.id,
    action: "status_change",
    before: { status: order.status },
    after: { status },
  });

  if (status === "shipped") {
    const fullOrder = await getOrderForAdmin(params.id);
    if (fullOrder?.shippingEmail) {
      await sendEmail({ to: fullOrder.shippingEmail, ...orderShippedEmail(fullOrder) });
    }
    if (order.user_id) {
      await notifyUser(
        order.user_id,
        "order_shipped",
        `Order #${fullOrder?.orderNumber ?? params.id} is on its way`,
        "",
        { relatedEntityType: "order", relatedEntityId: params.id }
      );
    }
  }

  return NextResponse.json({ id: params.id, status });
}
