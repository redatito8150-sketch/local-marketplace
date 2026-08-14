import { NextRequest, NextResponse, after } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { notify, notifyUser } from "@/lib/notify";

// A pending transfer request that never physically happened (e.g. the
// brand cancelled the shipment, or logged a mistaken request) — nothing on
// product_variants changes, since nothing was ever received.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: transfer } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  if (transfer.status !== "pending") return NextResponse.json({ error: "This transfer has already been decided" }, { status: 400 });

  const body = await request.json().catch(() => ({})) as { note?: string };

  const { error } = await supabaseAdmin.rpc("reject_warehouse_transfer", {
    p_transfer_id: params.id,
    p_actor_id: receiver.id,
    p_note: body.note?.trim() || null,
  });
  if (error) return safeErrorResponse("admin.warehouse.transfers.reject", error, "Failed to reject the transfer");

  // Same reasoning as the receive route: the RPC above already committed
  // the rejection, so the audit/Discord/owner-notification work below is
  // supplementary and must not risk delaying (or truncating) the response
  // the client is waiting on.
  after(async () => {
    const { data: brand } = await supabaseAdmin.from("brands").select("slug, name, owner_user_id").eq("id", transfer.brand_id).maybeSingle();

    await logAudit({
      actorId: receiver.id,
      actorLabel: receiver.email ?? receiver.id,
      entityType: "warehouse_transfer",
      entityId: params.id,
      action: "reject",
      after: { note: body.note ?? undefined },
      brandSlug: brand?.slug ?? undefined,
    });
    await notify(
      "warehouse_transfer_rejected",
      `Local Warehouse transfer rejected: ${brand?.name ?? ""}`,
      body.note ?? "",
      { relatedEntityType: "warehouse_transfer", relatedEntityId: params.id, actorLabel: receiver.email ?? receiver.id }
    );
    if (brand?.owner_user_id) {
      await notifyUser(
        brand.owner_user_id,
        "warehouse_transfer_rejected",
        "Your Local Warehouse transfer request was rejected",
        body.note ?? "",
        { relatedEntityType: "warehouse_transfer", relatedEntityId: params.id }
      );
    }
  });

  return NextResponse.json({ ok: true });
}
