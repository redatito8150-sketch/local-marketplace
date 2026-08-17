import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { checkAndNotifyRestock } from "@/lib/backInStock";

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const approver = await requireAdminUser();
  if (!approver) return NextResponse.json({ error: "An administrator must approve warehouse corrections" }, { status: 403 });

  const { id } = await props.params;
  const { data: correction } = await supabaseAdmin
    .from("warehouse_corrections")
    .select("id, transfer_id, correction_number, requested_by, warehouse_correction_lines(to_variant_id, action)")
    .eq("id", id)
    .maybeSingle();
  if (!correction) return NextResponse.json({ error: "Correction not found" }, { status: 404 });
  if (correction.requested_by === approver.id) {
    return NextResponse.json({ error: "The person who requested a correction cannot approve it" }, { status: 409 });
  }

  const { data: result, error } = await supabaseAdmin.rpc("approve_warehouse_correction", {
    p_correction_id: id,
    p_approver_id: approver.id,
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.corrections.approve", error, "Failed to approve and post the correction", 400);

  await logAudit({
    actorId: approver.id,
    actorLabel: approver.email ?? approver.id,
    entityType: "warehouse_transfer",
    entityId: correction.transfer_id as string,
    action: "approve",
    after: { "Correction posted": correction.correction_number },
  });

  const variantIds = ((correction.warehouse_correction_lines ?? []) as unknown as Array<{ to_variant_id: string | null; action: string }>)
    .filter((line) => line.to_variant_id && ["reclassify", "adjust_in", "restore_to_sellable"].includes(line.action))
    .map((line) => line.to_variant_id as string);
  if (variantIds.length) await checkAndNotifyRestock([...new Set(variantIds)]);

  return NextResponse.json(result);
}
