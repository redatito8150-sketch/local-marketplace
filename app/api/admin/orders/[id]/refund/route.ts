import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/errorLog";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

// Creates a pending refund request for one paid card order. Staff input is
// never treated as proof that Paymob moved money. Only an exact refund event
// from a separately verified provider source may confirm and allocate it.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: { amountCents?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const amountCents = typeof body.amountCents === "number" ? Math.trunc(body.amountCents) : NaN;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Enter the exact refunded amount in piasters (whole EGP cents)." }, { status: 400 });
  }
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const { data, error } = await supabaseAdmin.rpc("request_order_refund", {
    p_order_id: id,
    p_actor_id: staff.user.id,
    p_amount_cents: amountCents,
    p_note: note,
  });

  if (error) {
    const code = error.message.split(":")[0]?.trim();
    const MESSAGES: Record<string, string> = {
      ORDER_NOT_FOUND: "Order not found.",
      ORDER_NOT_CARD_PAID: "This order was not paid by card — there is nothing to refund here.",
      ORDER_HAS_NO_CAPTURED_AMOUNT: "This order has no recorded captured amount to refund against.",
      REFUND_EXCEEDS_CAPTURED_BALANCE: "That amount is more than the unconfirmed refundable balance on this order.",
      REFUND_REQUEST_ALREADY_PENDING: "This order already has a refund waiting for verified provider confirmation.",
      ACTOR_REQUIRED: "Could not identify the acting admin.",
      INVALID_AMOUNT: "Enter a valid refund amount.",
    };
    if (!MESSAGES[code]) logError("admin.orders.refund", error.message);
    return NextResponse.json({ error: MESSAGES[code] ?? "Couldn't record the refund. Please try again." }, { status: 400 });
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "order",
    entityId: id,
    action: "refund_requested",
    after: { amountCents, status: "pending_provider_confirmation" },
  });
  await notify("payment_refund_requested", "Refund confirmation requested", `Order ${id}`, {
    relatedEntityType: "order",
    relatedEntityId: id,
    actorLabel: staff.user.email ?? staff.user.id,
    meta: [{ label: "Amount", value: `${(amountCents / 100).toFixed(2)} EGP` }],
  });

  return NextResponse.json(data);
}
