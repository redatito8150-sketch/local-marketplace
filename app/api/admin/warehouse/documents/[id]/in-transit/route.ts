import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

// pending/submitted/approved -> in_transit.
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: result, error } = await supabaseAdmin.rpc("mark_warehouse_document_in_transit", {
    p_transfer_id: (await props.params).id,
    p_actor_id: receiver.id,
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.documents.inTransit", error, "Failed to mark the document in transit", 400);
  return NextResponse.json(result);
}
