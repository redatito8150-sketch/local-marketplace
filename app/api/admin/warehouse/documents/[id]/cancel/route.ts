import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

// draft/pending/submitted/approved -> cancelled. Not allowed once
// in_transit or already decided (received/partially_received/rejected).
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { note?: string } | null;
  if (!body?.note?.trim()) return NextResponse.json({ error: "A cancellation reason is required" }, { status: 400 });

  const { data: result, error } = await supabaseAdmin.rpc("cancel_warehouse_document", {
    p_transfer_id: params.id,
    p_actor_id: receiver.id,
    p_note: body.note.trim(),
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.documents.cancel", error, "Failed to cancel the document", 400);

  await logAudit({
    actorId: receiver.id,
    actorLabel: receiver.email ?? receiver.id,
    entityType: "warehouse_transfer",
    entityId: params.id,
    action: "delete",
    after: { Note: body.note.trim() },
  });

  return NextResponse.json(result);
}
