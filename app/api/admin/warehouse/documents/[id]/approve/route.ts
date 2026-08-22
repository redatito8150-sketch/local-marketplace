import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { notifyUser } from "@/lib/notify";

// pending/submitted -> approved.
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: transfer } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("direction, document_number, expected_arrival_at, brands(owner_user_id)")
    .eq("id", params.id)
    .maybeSingle();
  if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  const isReturn = transfer.direction === "to_brand";

  const { data: result, error } = await supabaseAdmin.rpc("accept_warehouse_document", {
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
    after: { Status: isReturn ? "Preparing return" : "Awaiting arrival" },
  });

  const ownerUserId = (transfer?.brands as unknown as { owner_user_id: string | null } | null)?.owner_user_id;
  if (ownerUserId) {
    const expectedArrivalAt = transfer?.expected_arrival_at ? new Date(transfer.expected_arrival_at as string) : null;
    const arrivalCopy = expectedArrivalAt && !Number.isNaN(expectedArrivalAt.getTime())
      ? ` Zakhnook is expecting it on ${expectedArrivalAt.toLocaleString("en-GB", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" })}.`
      : "";
    await notifyUser(
      ownerUserId,
      "warehouse_transfer_accepted",
      `${transfer?.document_number ?? "Your warehouse request"} was accepted`,
      isReturn
        ? "Zakhnook accepted your return request and is preparing the held units. You will be notified again when they are dispatched to your brand."
        : `Zakhnook accepted the requested delivery.${arrivalCopy} Inventory will be updated only after the physical receipt is confirmed.`,
      { relatedEntityType: "warehouse_transfer", relatedEntityId: params.id },
    );
  }

  return NextResponse.json(result);
}
