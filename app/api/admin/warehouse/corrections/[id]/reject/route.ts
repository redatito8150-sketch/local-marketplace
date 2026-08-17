import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const reviewer = await requireAdminUser();
  if (!reviewer) return NextResponse.json({ error: "An administrator must review warehouse corrections" }, { status: 403 });

  const { id } = await props.params;
  const body = await request.json().catch(() => null) as { note?: string } | null;
  if (!body?.note?.trim() || body.note.trim().length < 5) {
    return NextResponse.json({ error: "Explain why this correction is being rejected" }, { status: 400 });
  }

  const { data: correction } = await supabaseAdmin
    .from("warehouse_corrections")
    .select("id, transfer_id, correction_number, requested_by")
    .eq("id", id)
    .maybeSingle();
  if (!correction) return NextResponse.json({ error: "Correction not found" }, { status: 404 });
  if (correction.requested_by === reviewer.id) {
    return NextResponse.json({ error: "The person who requested a correction cannot review it" }, { status: 409 });
  }

  const { data: result, error } = await supabaseAdmin.rpc("reject_warehouse_correction", {
    p_correction_id: id,
    p_reviewer_id: reviewer.id,
    p_note: body.note.trim(),
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.corrections.reject", error, "Failed to reject the correction", 400);

  await logAudit({
    actorId: reviewer.id,
    actorLabel: reviewer.email ?? reviewer.id,
    entityType: "warehouse_transfer",
    entityId: correction.transfer_id as string,
    action: "reject",
    after: {
      "Correction rejected": correction.correction_number,
      Reason: body.note.trim(),
    },
  });

  return NextResponse.json(result);
}
