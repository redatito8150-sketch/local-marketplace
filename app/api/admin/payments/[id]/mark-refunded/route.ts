import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/errorLog";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";

// Creates a pending refund request for captured money that never became an
// order. It cannot confirm a refund; only an exact event from a separately
// verified provider source can match and confirm the request.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await params;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid payment attempt id" }, { status: 400 });
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

  const { data, error } = await supabaseAdmin.rpc("request_payment_attempt_refund", {
    p_payment_attempt_id: id,
    p_actor_id: staff.user.id,
    p_amount_cents: amountCents,
    p_note: note,
  });

  if (error) {
    const code = error.message.split(":")[0]?.trim();
    const MESSAGES: Record<string, string> = {
      PAYMENT_ATTEMPT_NOT_FOUND: "Payment attempt not found.",
      NO_FAILED_BUCKET_TO_REFUND: "This attempt has no failed, unrefunded bucket — record the refund against the specific order instead.",
      REFUND_EXCEEDS_CAPTURED_BALANCE: "That amount is more than what's still refundable for this attempt.",
      REFUND_REQUEST_ALREADY_PENDING: "This payment already has a refund waiting for verified provider confirmation.",
      ACTOR_REQUIRED: "Could not identify the acting admin.",
      INVALID_AMOUNT: "Enter a valid refund amount.",
    };
    if (!MESSAGES[code]) logError("request_payment_attempt_refund failed", error.message);
    return NextResponse.json({ error: MESSAGES[code] ?? "Couldn't request the refund. Please try again." }, { status: 400 });
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "payment_attempt",
    entityId: id,
    action: "refund_requested",
    after: { amountCents, status: "pending_provider_confirmation" },
  });
  await notify("payment_refund_requested", "Refund confirmation requested", `Payment attempt ${id}`, {
    relatedEntityType: "payment_attempt",
    relatedEntityId: id,
    actorLabel: staff.user.email ?? staff.user.id,
    meta: [{ label: "Amount", value: `${(amountCents / 100).toFixed(2)} EGP` }],
  });

  return NextResponse.json(data);
}
