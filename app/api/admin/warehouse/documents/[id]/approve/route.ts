import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { notifyUser } from "@/lib/notify";

// pending/submitted -> approved.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await request.json().catch(() => null) as { expectedArrivalAt?: string } | null;
  const expectedArrivalAt = body?.expectedArrivalAt ? new Date(body.expectedArrivalAt) : null;
  if (!expectedArrivalAt || Number.isNaN(expectedArrivalAt.getTime()) || expectedArrivalAt.getTime() < Date.now() - 5 * 60 * 1000) {
    return NextResponse.json({ error: "Choose a valid future arrival date and time" }, { status: 400 });
  }

  const { data: result, error } = await supabaseAdmin.rpc("accept_warehouse_document", {
    p_transfer_id: params.id,
    p_actor_id: receiver.id,
    p_expected_arrival_at: expectedArrivalAt.toISOString(),
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.documents.approve", error, "Failed to approve the document", 400);

  await logAudit({
    actorId: receiver.id,
    actorLabel: receiver.email ?? receiver.id,
    entityType: "warehouse_transfer",
    entityId: params.id,
    action: "approve",
    after: { Status: "Awaiting arrival", "Expected arrival": expectedArrivalAt.toISOString() },
  });

  const { data: transfer } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("document_number, brands(owner_user_id)")
    .eq("id", params.id)
    .maybeSingle();
  const ownerUserId = (transfer?.brands as unknown as { owner_user_id: string | null } | null)?.owner_user_id;
  if (ownerUserId) {
    await notifyUser(
      ownerUserId,
      "warehouse_transfer_accepted",
      `${transfer?.document_number ?? "Your warehouse request"} was accepted`,
      `Zakhnook is expecting the delivery on ${expectedArrivalAt.toLocaleString("en-GB", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" })}. Inventory will be updated only after the physical receipt is confirmed.`,
      { relatedEntityType: "warehouse_transfer", relatedEntityId: params.id },
    );
  }

  return NextResponse.json(result);
}
