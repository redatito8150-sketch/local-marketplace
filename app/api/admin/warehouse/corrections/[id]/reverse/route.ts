import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { parseOrderIdempotencyKey } from "@/lib/orders/idempotency";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const requester = await requireWarehouseReceiver();
  if (!requester) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const operationKey = parseOrderIdempotencyKey(request.headers.get("idempotency-key"));
  if (!operationKey) return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });

  const { id } = await props.params;
  const body = await request.json().catch(() => null) as { note?: string } | null;
  if (!body?.note?.trim() || body.note.trim().length < 5) {
    return NextResponse.json({ error: "Explain why the posted correction must be reversed" }, { status: 400 });
  }

  const { data: original } = await supabaseAdmin
    .from("warehouse_corrections")
    .select("id, transfer_id, correction_number")
    .eq("id", id)
    .maybeSingle();
  if (!original) return NextResponse.json({ error: "Correction not found" }, { status: 404 });

  const { data: result, error } = await supabaseAdmin.rpc("request_warehouse_correction_reversal", {
    p_original_correction_id: id,
    p_actor_id: requester.id,
    p_note: body.note.trim(),
    p_operation_key: operationKey,
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.corrections.reverse", error, "Failed to create the reversal request", 400);

  const reversal = result as { correctionId?: string; correctionNumber?: string };
  await logAudit({
    actorId: requester.id,
    actorLabel: requester.email ?? requester.id,
    entityType: "warehouse_transfer",
    entityId: original.transfer_id as string,
    action: "update",
    after: {
      "Reversal requested": reversal.correctionNumber ?? reversal.correctionId,
      "Original correction": original.correction_number,
      Reason: body.note.trim(),
    },
  });

  return NextResponse.json(result);
}
