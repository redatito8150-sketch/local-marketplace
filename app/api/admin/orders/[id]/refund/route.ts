import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/errorLog";

// Corrective pass 2, Section 1 (docs/audits/2026-08-20-production-security-
// correctness-reliability-audit-en.md): the only way to record a refund
// against a SPECIFIC paid card order — never an optional note, never
// applied blanket across every sibling order under the same purchase.
// Requires an exact amount and a real provider reference (from Paymob's
// own dashboard — this never calls Paymob's Refund API itself); the
// database enforces the amount can never exceed what was actually
// captured for this order and that the same provider reference can never
// be recorded twice. cancel_order only unblocks a card order once its
// payment_status here reaches 'refunded'.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: { amountCents?: unknown; providerReference?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const amountCents = typeof body.amountCents === "number" ? Math.trunc(body.amountCents) : NaN;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Enter the exact refunded amount in piasters (whole EGP cents)." }, { status: 400 });
  }
  const providerReference = typeof body.providerReference === "string" ? body.providerReference.trim() : "";
  if (!providerReference) {
    return NextResponse.json({ error: "A provider (Paymob) refund reference is required." }, { status: 400 });
  }
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const { data, error } = await supabaseAdmin.rpc("record_order_refund", {
    p_order_id: id,
    p_actor_id: staff.user.id,
    p_amount_cents: amountCents,
    p_provider_reference: providerReference,
    p_note: note,
  });

  if (error) {
    const code = error.message.split(":")[0]?.trim();
    const MESSAGES: Record<string, string> = {
      ORDER_NOT_FOUND: "Order not found.",
      ORDER_NOT_CARD_PAID: "This order was not paid by card — there is nothing to refund here.",
      ORDER_HAS_NO_CAPTURED_AMOUNT: "This order has no recorded captured amount to refund against.",
      REFUND_EXCEEDS_CAPTURED_BALANCE: "That amount is more than what's still refundable on this order.",
      REFUND_REFERENCE_ALREADY_USED: "This provider reference was already used for a different order or amount.",
      ACTOR_REQUIRED: "Could not identify the acting admin.",
      INVALID_AMOUNT: "Enter a valid refund amount.",
      PROVIDER_REFERENCE_REQUIRED: "A provider (Paymob) refund reference is required.",
    };
    if (!MESSAGES[code]) logError("admin.orders.refund", error.message);
    return NextResponse.json({ error: MESSAGES[code] ?? "Couldn't record the refund. Please try again." }, { status: 400 });
  }

  return NextResponse.json(data);
}
