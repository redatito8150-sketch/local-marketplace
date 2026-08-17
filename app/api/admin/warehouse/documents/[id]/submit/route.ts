import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

// draft -> submitted. Existing documents (created via
// request_warehouse_transfer/request_warehouse_return) already start at
// 'pending', functionally equivalent to 'submitted' — this endpoint exists
// for a future richer document-creation flow that starts at 'draft'.
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: result, error } = await supabaseAdmin.rpc("submit_warehouse_document", {
    p_transfer_id: params.id,
    p_actor_id: receiver.id,
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.documents.submit", error, "Failed to submit the document", 400);
  await logAudit({
    actorId: receiver.id,
    actorLabel: receiver.email ?? receiver.id,
    entityType: "warehouse_transfer",
    entityId: params.id,
    action: "status_change",
    after: { Status: "submitted" },
  });
  return NextResponse.json(result);
}
