import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { notify, notifyUser } from "@/lib/notify";
import { checkAndNotifyRestock } from "@/lib/backInStock";
import { describeInventoryAdjustments } from "@/lib/admin/describeInventoryAdjustment";

type ReceiveItemInput = {
  itemId: string;
  receivedOkQty: number;
  damagedQty: number;
  missingQty: number;
  itemNote?: string;
};

// Zakhnook's own warehouse staff (or an admin) confirming a physical
// delivery against its transfer request — every line must be fully
// reconciled (received + damaged + missing === requested, enforced in the
// RPC itself) before product_variants.quantity, the one column the
// storefront reads, actually rises.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data: transfer } = await supabaseAdmin
    .from("warehouse_transfers")
    .select("id, brand_id, status, direction")
    .eq("id", params.id)
    .maybeSingle();
  if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  if (transfer.status !== "pending") return NextResponse.json({ error: "This transfer has already been decided" }, { status: 400 });
  const isReturn = transfer.direction === "to_brand";

  const body = await request.json().catch(() => null) as { items?: ReceiveItemInput[]; note?: string } | null;
  if (!body?.items?.length) return NextResponse.json({ error: "Reconcile at least one item" }, { status: 400 });
  const submittedIds = body.items.map((item) => item.itemId);
  if (new Set(submittedIds).size !== submittedIds.length) {
    return NextResponse.json({ error: "Each transfer item must appear exactly once" }, { status: 400 });
  }
  for (const item of body.items) {
    if (![item.receivedOkQty, item.damagedQty, item.missingQty].every((n) => Number.isInteger(n) && n >= 0)) {
      return NextResponse.json({ error: "Received, damaged, and missing counts must be whole, non-negative numbers" }, { status: 400 });
    }
  }

  const { data: expectedItems, error: expectedItemsError } = await supabaseAdmin
    .from("warehouse_transfer_items")
    .select("id")
    .eq("transfer_id", params.id);
  if (expectedItemsError) {
    return safeErrorResponse(
      "admin.warehouse.transfers.receive-items",
      expectedItemsError,
      "Failed to load transfer items"
    );
  }
  const expectedIds = new Set((expectedItems ?? []).map((item) => item.id));
  if (
    expectedIds.size !== submittedIds.length ||
    submittedIds.some((itemId) => !expectedIds.has(itemId))
  ) {
    return NextResponse.json(
      { error: "Every transfer item must be reconciled exactly once" },
      { status: 400 }
    );
  }

  const { data: results, error } = await supabaseAdmin.rpc(isReturn ? "receive_warehouse_return" : "receive_warehouse_transfer", {
    p_transfer_id: params.id,
    p_actor_id: receiver.id,
    p_items: body.items.map((item) => ({
      item_id: item.itemId,
      received_ok_qty: item.receivedOkQty,
      damaged_qty: item.damagedQty,
      missing_qty: item.missingQty,
      item_note: item.itemNote ?? null,
    })),
    p_note: body.note ?? null,
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.transfers.receive", error, isReturn ? "Failed to confirm the return" : "Failed to confirm receipt", 400);

  const { data: brand } = await supabaseAdmin.from("brands").select("slug, name, owner_user_id").eq("id", transfer.brand_id).maybeSingle();

  const { data: itemRows } = await supabaseAdmin
    .from("warehouse_transfer_items")
    .select("id, variant_id, product_variants(sku)")
    .eq("transfer_id", params.id)
    .in("id", body.items.map((item) => item.itemId));
  const skuByVariantId = new Map(
    (itemRows ?? []).map((row) => [row.variant_id as string, (row.product_variants as unknown as { sku: string } | null)?.sku ?? row.variant_id])
  );
  const receivedResults = (results ?? []) as { variant_id: string; received_ok_qty: number; damaged_qty: number; missing_qty: number; new_quantity: number }[];
  const changeSummary = describeInventoryAdjustments(
    receivedResults
      .filter((r) => isReturn ? r.received_ok_qty + r.damaged_qty + r.missing_qty > 0 : r.received_ok_qty > 0)
      .map((r) => {
        const delta = isReturn ? -(r.received_ok_qty + r.damaged_qty + r.missing_qty) : r.received_ok_qty;
        return { sku: skuByVariantId.get(r.variant_id) ?? r.variant_id, previousQuantity: r.new_quantity - delta, newQuantity: r.new_quantity };
      })
  );
  const discrepancySummary = receivedResults
    .filter((r) => r.damaged_qty > 0 || r.missing_qty > 0)
    .map((r) => `${skuByVariantId.get(r.variant_id) ?? r.variant_id}: damaged ${r.damaged_qty}, missing ${r.missing_qty}`)
    .join("\n");

  await logAudit({
    actorId: receiver.id,
    actorLabel: receiver.email ?? receiver.id,
    entityType: "warehouse_transfer",
    entityId: params.id,
    action: "approve",
    after: {
      [isReturn ? "Stock returned to brand" : "Stock received"]: changeSummary || undefined,
      Discrepancies: discrepancySummary || undefined,
      Note: body.note || undefined,
    },
    brandSlug: brand?.slug ?? undefined,
  });

  const hasDiscrepancy = body.items.some((item) => item.damagedQty > 0 || item.missingQty > 0);
  await notify(
    "warehouse_transfer_received",
    `Local Warehouse ${isReturn ? "return" : "transfer"} confirmed: ${brand?.name ?? ""}${hasDiscrepancy ? " (with discrepancies)" : ""}`,
    body.note ?? "",
    {
      relatedEntityType: "warehouse_transfer",
      relatedEntityId: params.id,
      actorLabel: receiver.email ?? receiver.id,
    }
  );

  if (brand?.owner_user_id) {
    await notifyUser(
      brand.owner_user_id,
      "warehouse_transfer_received",
      isReturn
        ? (hasDiscrepancy ? "Your return was confirmed — with some discrepancies" : "Your return was confirmed in full")
        : (hasDiscrepancy ? "Your transfer was received — with some discrepancies" : "Your transfer was received in full"),
      body.note ?? "",
      { relatedEntityType: "warehouse_transfer", relatedEntityId: params.id }
    );
  }

  if (!isReturn) {
    const variantIds = ((results as { variant_id: string; received_ok_qty: number }[] | null) ?? [])
      .filter((r) => r.received_ok_qty > 0)
      .map((r) => r.variant_id);
    if (variantIds.length) await checkAndNotifyRestock(variantIds);
  }

  return NextResponse.json({ ok: true, results });
}
