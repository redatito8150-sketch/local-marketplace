import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/errorLog";

// Records that a refund has been handled outside this system — never calls
// Paymob's Refund API. Rejects a second attempt to mark the same
// payment_attempt refunded (see mark_payment_attempt_refund_recorded's own
// guard in the Phase 3 migration), so two admins can't both process it.
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

  let note: string | null = null;
  try {
    const body = (await request.json()) as { note?: unknown };
    if (typeof body.note === "string" && body.note.trim()) {
      note = body.note.trim().slice(0, 500);
    }
  } catch {
    // No body/invalid JSON — a note is optional, proceed without one.
  }

  const { data, error } = await supabaseAdmin.rpc("mark_payment_attempt_refund_recorded", {
    p_payment_attempt_id: id,
    p_actor_id: staff.user.id,
    p_note: note,
  });

  if (error) {
    if (error.message?.startsWith("ALREADY_MARKED_REFUNDED")) {
      return NextResponse.json(
        { error: "This payment attempt was already marked as refunded." },
        { status: 409 }
      );
    }
    if (error.message?.startsWith("PAYMENT_ATTEMPT_NOT_REFUND_ELIGIBLE")) {
      return NextResponse.json(
        { error: "This payment attempt isn't in a state that needs a refund." },
        { status: 409 }
      );
    }
    logError("mark_payment_attempt_refund_recorded failed", error.message);
    return NextResponse.json({ error: "Couldn't record the refund. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, refundedAt: (data as { refunded_at: string }).refunded_at });
}
