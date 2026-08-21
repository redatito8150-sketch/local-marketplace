import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { logError } from "@/lib/errorLog";
import { notify } from "@/lib/notify";
import { notifyOrderRefundConfirmed } from "@/lib/orders/notifyOrderRefundConfirmed";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; refundId: string }> }
) {
  const staff = await requireStaffRole("admin");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id, refundId } = await params;
  const body = (await request.json().catch(() => null)) as { requestId?: unknown } | null;
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  if (![id, refundId, requestId].every((value) => UUID_RE.test(value))) {
    return NextResponse.json({ error: "Invalid refund allocation." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("allocate_provider_refund", {
    p_refund_id: refundId,
    p_request_id: requestId,
    p_actor_id: staff.user.id,
  });
  if (error) {
    const code = error.message.split(":")[0]?.trim();
    const messages: Record<string, string> = {
      PROVIDER_REFUND_NOT_FOUND: "The confirmed Paymob refund was not found.",
      PROVIDER_REFUND_ALREADY_ALLOCATED: "This Paymob refund is already allocated.",
      REFUND_REQUEST_NOT_FOUND: "The pending refund request was not found.",
      REFUND_REQUEST_NOT_PENDING: "This refund request is no longer pending.",
      REFUND_REQUEST_PAYMENT_MISMATCH: "The refund and request belong to different payments.",
      REFUND_REQUEST_AMOUNT_MISMATCH: "The confirmed amount does not equal the requested amount.",
      ACTOR_REQUIRED: "Could not identify the acting admin.",
    };
    if (!messages[code]) logError("allocate_provider_refund failed", error.message);
    return NextResponse.json({ error: messages[code] ?? "Couldn't allocate this refund." }, { status: 400 });
  }

  const result = data as {
    allocation_id: string;
    order_id: string | null;
    amount_cents: number;
    target_kind: "order" | "failed_fulfillment";
  };
  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: result.order_id ? "order" : "payment_attempt",
    entityId: result.order_id ?? id,
    action: "refund_confirmed",
    after: { refundId, requestId, allocationId: result.allocation_id, manuallyAllocated: true },
  });
  await notify("payment_refund_confirmed", "Confirmed Paymob refund allocated", "A verified provider event was matched to its pending request.", {
    relatedEntityType: result.order_id ? "order" : "payment_attempt",
    relatedEntityId: result.order_id ?? id,
    actorLabel: staff.user.email ?? staff.user.id,
  });
  if (result.order_id) {
    await notifyOrderRefundConfirmed({
      orderId: result.order_id,
      refundId,
      amountCents: Number(result.amount_cents),
    });
  }
  return NextResponse.json(result);
}
