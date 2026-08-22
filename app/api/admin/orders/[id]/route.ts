import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORDER_STATUSES } from "@/lib/admin/statuses";
import { logAudit } from "@/lib/auditLog";
import { notify, notifyUser } from "@/lib/notify";
import { sendEmail } from "@/lib/email/sendEmail";
import { orderCancelledEmail } from "@/lib/email/templates/orderCancelled";
import { orderShippedEmail } from "@/lib/email/templates/orderShipped";
import { getOrderForAdmin } from "@/lib/data/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logError } from "@/lib/errorLog";
import { z } from "zod";

const shipmentTrackingSchema = z.object({
  carrierName: z.string().trim().min(1).max(120).nullable(),
  trackingNumber: z.string().trim().min(1).max(160).nullable(),
  expectedDeliveryAt: z.string().datetime().nullable(),
});

const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  ALREADY_CANCELLED: "This order is already cancelled",
  CANNOT_CANCEL_SHIPPED: "A shipped order can't be cancelled",
  CANNOT_CANCEL_FULFILLED: "A fulfilled (delivered) order can't be cancelled",
  ORDER_NOT_FOUND: "Order not found",
  // Audit finding PAY-03 (docs/audits/2026-08-20-production-security-
  // correctness-reliability-audit-en.md): cancel_order itself now rejects
  // a captured, un-refunded card order — record the refund via
  // /admin/payments first (mark-refunded), which also syncs
  // orders.payment_status, then cancel.
  PAID_ORDER_REQUIRES_REFUND_REVIEW: "This order was paid by card. Record the refund in Payments before cancelling it.",
};

const TRANSITION_ERROR_MESSAGES: Record<string, string> = {
  ORDER_NOT_FOUND: "Order not found",
  ORDER_STATUS_CONFLICT: "The order changed while you were editing it. Refresh and try again.",
  INVALID_ORDER_TRANSITION: "That order status transition isn't allowed",
  USE_CANCEL_ORDER: "Cancellation must use the protected cancellation workflow",
};

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();

  if (body.tracking && typeof body.tracking === "object") {
    const parsed = shipmentTrackingSchema.safeParse(body.tracking);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter valid carrier, tracking and expected-delivery details" }, { status: 400 });
    }
    const { data: existingTracking, error: readError } = await supabaseAdmin
      .from("orders")
      .select("order_number, user_id, carrier_name, tracking_number, expected_delivery_at, updated_at")
      .eq("id", params.id)
      .maybeSingle();
    if (readError) return safeErrorResponse("admin.orders.tracking.read", readError, "Failed to load shipping details");
    if (!existingTracking) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const nextTracking = {
      carrier_name: parsed.data.carrierName,
      tracking_number: parsed.data.trackingNumber,
      expected_delivery_at: parsed.data.expectedDeliveryAt,
    };
    const trackingUnchanged =
      (existingTracking.carrier_name ?? null) === parsed.data.carrierName
      && (existingTracking.tracking_number ?? null) === parsed.data.trackingNumber
      && (existingTracking.expected_delivery_at ?? null) === parsed.data.expectedDeliveryAt;
    if (trackingUnchanged) {
      return NextResponse.json({ id: params.id, tracking: parsed.data, updatedAt: existingTracking.updated_at, unchanged: true });
    }
    if (typeof body.expectedUpdatedAt === "string" && body.expectedUpdatedAt !== existingTracking.updated_at) {
      return NextResponse.json({ error: "This shipment changed in another session. Refresh before saving shipping details." }, { status: 409 });
    }

    const { data: updatedTracking, error: updateError } = await supabaseAdmin
      .from("orders")
      .update(nextTracking)
      .eq("id", params.id)
      .eq("updated_at", existingTracking.updated_at)
      .select("updated_at")
      .maybeSingle();
    if (updateError) return safeErrorResponse("admin.orders.tracking.save", updateError, "Failed to save shipping details");
    if (!updatedTracking) {
      return NextResponse.json({ error: "This shipment changed in another session. Refresh before saving shipping details." }, { status: 409 });
    }

    await logAudit({
      actorId: admin.id,
      actorLabel: admin.email ?? admin.id,
      entityType: "order",
      entityId: params.id,
      action: "shipment_tracking_update",
      before: {
        carrierName: existingTracking.carrier_name,
        trackingNumber: existingTracking.tracking_number,
        expectedDeliveryAt: existingTracking.expected_delivery_at,
      },
      after: {
        carrierName: parsed.data.carrierName,
        trackingNumber: parsed.data.trackingNumber,
        expectedDeliveryAt: parsed.data.expectedDeliveryAt,
      },
    });
    if (existingTracking.user_id) {
      const detail = parsed.data.trackingNumber
        ? `${parsed.data.carrierName || "Carrier"} · ${parsed.data.trackingNumber}`
        : parsed.data.expectedDeliveryAt
          ? `Expected delivery: ${new Intl.DateTimeFormat("en-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }).format(new Date(parsed.data.expectedDeliveryAt))}`
          : "Open your order to see the latest delivery details.";
      await notifyUser(existingTracking.user_id, "order_tracking_updated", `Shipping updated for #${existingTracking.order_number}`, detail, {
        relatedEntityType: "order",
        relatedEntityId: params.id,
      });
    }
    return NextResponse.json({ id: params.id, tracking: parsed.data, updatedAt: updatedTracking.updated_at });
  }

  // Internal notes are a separate, admin-only field — never touches status,
  // never triggers a notification/email, unlike every other field here.
  if (typeof body.internalNotes === "string") {
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ internal_notes: body.internalNotes })
      .eq("id", params.id);

    if (error) {
      return safeErrorResponse("admin.orders.save-note", error, "Failed to save note");
    }

    await logAudit({
      actorId: admin.id,
      actorLabel: admin.email ?? admin.id,
      entityType: "order",
      entityId: params.id,
      action: "update",
      after: { internalNotes: body.internalNotes },
    });

    return NextResponse.json({ id: params.id, internalNotes: body.internalNotes });
  }

  const status = body.status;

  if (!ORDER_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("orders")
    .select("status, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (existingError) {
    return safeErrorResponse("admin.orders.read", existingError, "Failed to load order");
  }
  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (status === "cancelled") {
    // Restock + status flip happen atomically in the DB — a double-cancel
    // or an attempt to cancel a fulfilled order is rejected there, not here.
    const { error: rpcError } = await supabaseAdmin.rpc("cancel_order", {
      p_order_id: params.id,
    });

    if (rpcError) {
      const code = rpcError.message.split(":")[0]?.trim();
      const message = CANCEL_ERROR_MESSAGES[code];
      if (!message) logError("admin.orders.cancel", rpcError.message);
      return NextResponse.json({ error: message ?? "Failed to cancel order" }, { status: 400 });
    }
  } else {
    const { error: rpcError } = await supabaseAdmin.rpc("transition_order_status", {
      p_order_id: params.id,
      p_expected_status: existing.status,
      p_new_status: status,
      p_actor_id: admin.id,
      p_note: null,
    });

    if (rpcError) {
      const code = rpcError.message.split(":")[0]?.trim();
      const message = TRANSITION_ERROR_MESSAGES[code];
      if (!message) logError("admin.orders.transition", rpcError.message);
      return NextResponse.json(
        { error: message ?? "Failed to update order" },
        { status: code === "ORDER_NOT_FOUND" ? 404 : code === "ORDER_STATUS_CONFLICT" ? 409 : 400 }
      );
    }
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "order",
    entityId: params.id,
    action: "status_change",
    before: existing,
    after: { status },
  });

  const order = await getOrderForAdmin(params.id);
  if (order && order.shippingEmail) {
    if (status === "cancelled") {
      await notify("order_cancelled", `Order cancelled: #${order.orderNumber}`, order.shippingName, {
        relatedEntityType: "order",
        relatedEntityId: params.id,
        entityIdLabel: "Order ID",
        actorLabel: admin.email ?? admin.id,
        detailLabel: "Customer",
      });
      await sendEmail({ to: order.shippingEmail, ...orderCancelledEmail(order) });
    } else if (status === "shipped") {
      await sendEmail({ to: order.shippingEmail, ...orderShippedEmail(order) });
    }
  }

  // In-site notification for the customer's own account — only meaningful
  // for the statuses that actually change what they should expect next;
  // "pending"/"paid" are internal-facing housekeeping, not worth a ping.
  // Guest orders (no account) have no user_id to notify.
  if (existing?.user_id && order) {
    const CUSTOMER_NOTIFICATION_TEXT: Partial<Record<typeof status, { title: string; body: string }>> = {
      cancelled: { title: `Order #${order.orderNumber} was cancelled`, body: "" },
      preparing: { title: `Order #${order.orderNumber} is being prepared`, body: "The items are being packed." },
      ready_for_pickup: { title: `Order #${order.orderNumber} is ready for pickup`, body: "Zakhnook owns the next delivery step." },
      shipped: { title: `Order #${order.orderNumber} is on its way`, body: "" },
      fulfilled: { title: `Order #${order.orderNumber} was delivered`, body: "" },
    };
    const text = CUSTOMER_NOTIFICATION_TEXT[status];
    if (text) {
      await notifyUser(existing.user_id, `order_${status}`, text.title, text.body, {
        relatedEntityType: "order",
        relatedEntityId: params.id,
      });
    }
  }

  return NextResponse.json({ id: params.id, status });
}
