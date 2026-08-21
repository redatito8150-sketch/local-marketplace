import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { logError } from "@/lib/errorLog";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; allocationId: string }> }
) {
  const staff = await requireStaffRole("admin");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id, allocationId } = await params;
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (!reason) return NextResponse.json({ error: "A correction reason is required." }, { status: 400 });

  const { data, error } = await supabaseAdmin.rpc("reverse_order_refund_allocation", {
    p_order_id: id,
    p_allocation_id: allocationId,
    p_actor_id: staff.user.id,
    p_reason: reason,
  });
  if (error) {
    const code = error.message.split(":")[0]?.trim();
    const messages: Record<string, string> = {
      REFUND_ALLOCATION_NOT_FOUND: "Refund allocation not found.",
      REFUND_ALLOCATION_ALREADY_REVERSED: "This allocation was already reversed.",
      REFUND_ALLOCATION_ORDER_MISMATCH: "Refund allocation does not belong to this order.",
      ORDER_REFUND_ALLOCATION_REQUIRED: "This is not an order refund allocation.",
      CANNOT_REVERSE_AFTER_CANCELLATION: "The order was already cancelled and restocked. Escalate this correction instead.",
      ACTOR_REQUIRED: "Could not identify the acting admin.",
      REVERSAL_REASON_REQUIRED: "A correction reason is required.",
    };
    if (!messages[code]) logError("reverse_order_refund_allocation failed", error.message);
    return NextResponse.json({ error: messages[code] ?? "Couldn't reverse the allocation." }, { status: 400 });
  }
  const result = data as { order_id?: string } | null;

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "order",
    entityId: id,
    action: "refund_allocation_reversed",
    after: { allocationId, reason },
  });
  await notify("payment_refund_allocation_reversed", "Refund allocation reversed", reason, {
    relatedEntityType: "order",
    relatedEntityId: id,
    actorLabel: staff.user.email ?? staff.user.id,
  });
  return NextResponse.json(result);
}
