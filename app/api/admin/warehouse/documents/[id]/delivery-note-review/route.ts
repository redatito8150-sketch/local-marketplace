import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await props.params;
  const { data: transfer, error: transferError } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("id, document_number, receiving_note, brand_delivery_note_reviewed_at")
    .eq("id", id)
    .maybeSingle();
  if (transferError) return safeErrorResponse("admin.warehouse.delivery-note-review.load", transferError, "Failed to load the Brand note");
  if (!transfer) return NextResponse.json({ error: "Warehouse document not found" }, { status: 404 });

  const { data: result, error } = await supabaseAdmin.rpc("mark_brand_delivery_note_reviewed", {
    p_transfer_id: id,
    p_actor_id: receiver.id,
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.delivery-note-review", error, "Failed to close the Brand note review", 400);

  const replayed = Boolean((result as { replayed?: boolean } | null)?.replayed);
  if (!replayed) {
    await logAudit({
      actorId: receiver.id,
      actorLabel: receiver.email ?? receiver.id,
      entityType: "warehouse_transfer",
      entityId: id,
      action: "update",
      before: { "Brand delivery note review": "Needs review" },
      after: {
        "Brand delivery note review": "Done",
        "Brand delivery note": transfer.receiving_note,
        Document: transfer.document_number,
      },
    });
  }

  return NextResponse.json({ ok: true, result });
}
