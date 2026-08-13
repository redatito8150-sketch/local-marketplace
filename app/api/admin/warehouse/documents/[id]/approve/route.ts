import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

// pending/submitted -> approved.
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: result, error } = await supabaseAdmin.rpc("approve_warehouse_document", {
    p_transfer_id: params.id,
    p_actor_id: receiver.id,
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.documents.approve", error, "Failed to approve the document", 400);

  await logAudit({
    actorId: receiver.id,
    actorLabel: receiver.email ?? receiver.id,
    entityType: "warehouse_transfer",
    entityId: params.id,
    action: "approve",
    after: { Status: "approved" },
  });

  return NextResponse.json(result);
}
