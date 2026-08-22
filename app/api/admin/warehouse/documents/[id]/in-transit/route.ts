import { NextRequest, NextResponse, after } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { notify, notifyUser } from "@/lib/notify";

type DispatchItemInput = { itemId: string; dispatchedQty: number; itemNote?: string };

// approved -> in_transit. Outbound returns must submit every counted
// Document line; the RPC records the lines and physical route atomically.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: transfer } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("direction, document_number, brand_id, brands(name, owner_user_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });

  const body = await request.json().catch(() => null) as { items?: DispatchItemInput[]; note?: string } | null;
  if (transfer.direction === "to_brand") {
    if (!body?.items?.length) return NextResponse.json({ error: "Complete every Document line before dispatch" }, { status: 400 });
    const itemIds = body.items.map((item) => item.itemId);
    if (new Set(itemIds).size !== itemIds.length) return NextResponse.json({ error: "Each Document line must appear exactly once" }, { status: 400 });
    if (body.items.some((item) => !item.itemId || !Number.isInteger(item.dispatchedQty) || item.dispatchedQty <= 0)) {
      return NextResponse.json({ error: "Every dispatched quantity must be a positive whole number" }, { status: 400 });
    }
  }

  const { data: result, error } = transfer.direction === "to_brand"
    ? await supabaseAdmin.rpc("dispatch_warehouse_return", {
      p_transfer_id: params.id,
      p_actor_id: receiver.id,
      p_items: body!.items!.map((item) => ({ item_id: item.itemId, dispatched_qty: item.dispatchedQty, item_note: item.itemNote?.trim() || null })),
      p_note: body?.note?.trim() || null,
    } as never)
    : await supabaseAdmin.rpc("mark_warehouse_document_in_transit", {
      p_transfer_id: params.id,
      p_actor_id: receiver.id,
    } as never);
  if (error) return safeErrorResponse("admin.warehouse.documents.inTransit", error, "Failed to mark the document in transit", 400);
  await logAudit({
    actorId: receiver.id,
    actorLabel: receiver.email ?? receiver.id,
    entityType: "warehouse_transfer",
    entityId: params.id,
    action: "status_change",
    after: { Status: transfer.direction === "to_brand" ? "In transit to brand" : "In transit" },
  });
  if (transfer.direction === "to_brand") {
    const brand = transfer.brands as unknown as { name: string; owner_user_id: string | null } | null;
    after(async () => {
      await notify(
        "warehouse_return_dispatched",
        `Stock return dispatched to ${brand?.name ?? "brand"}`,
        `${transfer.document_number ?? "Stock Return Note"} has physically left Zakhnook after every Document line was counted.`,
        { relatedEntityType: "warehouse_transfer", relatedEntityId: params.id, actorLabel: receiver.email ?? receiver.id },
      );
      if (brand?.owner_user_id) await notifyUser(
        brand.owner_user_id,
        "warehouse_return_dispatched",
        `${transfer.document_number ?? "Your stock return"} is on the way`,
        "The return has left Zakhnook and is now in transit. Review the expected units, then confirm when the shipment arrives. You can add an optional delivery note if Zakhnook needs to follow up.",
        { relatedEntityType: "warehouse_transfer", relatedEntityId: params.id },
      );
    });
  }
  return NextResponse.json(result);
}
