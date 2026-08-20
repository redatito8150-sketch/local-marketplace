import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOrderForAdmin } from "@/lib/data/admin";
import { logAudit } from "@/lib/auditLog";
import { notify, notifyUser } from "@/lib/notify";
import { sendEmail } from "@/lib/email/sendEmail";
import { orderCancelledEmail } from "@/lib/email/templates/orderCancelled";

const ERRORS: Record<string, string> = {
  ORDER_NOT_FOUND: "Order not found.",
  ORDER_STATUS_CONFLICT: "The order changed while you were viewing it. Refresh and try again.",
  BRAND_ORDER_MISMATCH: "This order does not belong to your brand.",
  INVALID_CANCELLATION_REASON: "Please provide a clear reason for cancelling this order.",
  ORDER_CAN_NO_LONGER_BE_CANCELLED: "This order can no longer be cancelled because fulfillment has progressed.",
  // Audit finding PAY-03 (docs/audits/2026-08-20-production-security-
  // correctness-reliability-audit-en.md): cancel_order (which
  // cancel_brand_order delegates to) now rejects a captured, un-refunded
  // card order outright — an admin must record the refund first.
  PAID_ORDER_REQUIRES_REFUND_REVIEW: "This order was paid by card. Ask an admin to record the refund before cancelling it.",
};

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const body = await request.json().catch(() => null);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 5 || reason.length > 500) {
    return NextResponse.json({ error: ERRORS.INVALID_CANCELLATION_REASON }, { status: 400 });
  }

  const owner = await requireActiveBrandOwner(body?.brandSlug);
  if (!owner?.brandSlug) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("status, user_id, brand_slug, fulfillment_type")
    .eq("id", id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: ERRORS.ORDER_NOT_FOUND }, { status: 404 });
  if (order.brand_slug !== owner.brandSlug || order.fulfillment_type !== "brand_direct") {
    return NextResponse.json({ error: ERRORS.BRAND_ORDER_MISMATCH }, { status: 403 });
  }

  const { error } = await supabaseAdmin.rpc("cancel_brand_order", {
    p_order_id: id,
    p_expected_status: order.status,
    p_brand_slug: owner.brandSlug,
    p_actor_id: owner.user.id,
    p_reason: reason,
  });
  if (error) {
    const code = error.message.split(":")[0]?.trim();
    return NextResponse.json(
      { error: ERRORS[code] ?? "We couldn't cancel this order. Please try again." },
      { status: code === "ORDER_NOT_FOUND" ? 404 : code === "ORDER_STATUS_CONFLICT" ? 409 : 400 }
    );
  }

  await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "order",
    entityId: id,
    action: "status_change",
    before: { status: order.status },
    after: { status: "cancelled", reason },
  });

  const fullOrder = await getOrderForAdmin(id);
  if (fullOrder?.shippingEmail) {
    await sendEmail({ to: fullOrder.shippingEmail, ...orderCancelledEmail(fullOrder) });
  }
  if (order.user_id && fullOrder) {
    await notifyUser(order.user_id, "order_cancelled", `Order #${fullOrder.orderNumber} was cancelled`, reason, {
      relatedEntityType: "order",
      relatedEntityId: id,
    });
  }
  await notify("order_cancelled", `Brand could not fulfill #${fullOrder?.orderNumber ?? id}`, reason, {
    relatedEntityType: "order",
    relatedEntityId: id,
    actorLabel: owner.user.email ?? owner.user.id,
    detailLabel: "Reason",
  });

  return NextResponse.json({ id, status: "cancelled" });
}
