import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ORDER_STATUSES } from "@/lib/admin/statuses";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { sendEmail } from "@/lib/email/sendEmail";
import { orderCancelledEmail } from "@/lib/email/templates/orderCancelled";
import { orderShippedEmail } from "@/lib/email/templates/orderShipped";
import { getOrderForAdmin } from "@/lib/data/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logError } from "@/lib/errorLog";

const CANCEL_ERROR_MESSAGES: Record<string, string> = {
  ALREADY_CANCELLED: "This order is already cancelled",
  CANNOT_CANCEL_FULFILLED: "A fulfilled (delivered) order can't be cancelled",
  ORDER_NOT_FOUND: "Order not found",
};

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();

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

  const { data: existing } = await supabaseAdmin
    .from("orders")
    .select("status")
    .eq("id", params.id)
    .maybeSingle();

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
    const { error } = await supabaseAdmin
      .from("orders")
      .update({ status })
      .eq("id", params.id);

    if (error) {
      return safeErrorResponse("admin.orders.status", error, "Failed to update order");
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
        entityId: order.orderNumber,
        entityIdLabel: "Order ID",
        actorLabel: admin.email ?? admin.id,
        detailLabel: "Customer",
      });
      await sendEmail({ to: order.shippingEmail, ...orderCancelledEmail(order) });
    } else if (status === "shipped") {
      await sendEmail({ to: order.shippingEmail, ...orderShippedEmail(order) });
    }
  }

  return NextResponse.json({ id: params.id, status });
}
