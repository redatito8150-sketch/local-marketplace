import { NextRequest, NextResponse, after } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { notify, notifyUser } from "@/lib/notify";
import { checkAndNotifyRestock } from "@/lib/backInStock";
import { describeInventoryAdjustments } from "@/lib/admin/describeInventoryAdjustment";
import { parseOrderIdempotencyKey } from "@/lib/orders/idempotency";

type ReceiveItemInput = {
  itemId: string;
  receivedOkQty?: number;
  actualVariantId?: string | null;
  goodQty?: number;
  damagedQty: number;
  missingQty?: number;
  unidentifiedQty?: number;
  unidentifiedSku?: string;
  itemNote?: string;
};

type ReceiveDocumentResult = {
  items: { variant_id: string | null; received_ok_qty: number; damaged_qty: number; missing_qty: number; excess_qty?: number; new_quantity: number; outcome?: string }[];
  status: "partially_received" | "received";
  remaining_unreconciled: number;
};

const INBOUND_RECEIVABLE_STATUSES = new Set(["approved", "in_transit", "partially_received"]);
const RETURN_RECEIVABLE_STATUSES = new Set(["in_transit", "partially_received"]);

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
  const isReturn = transfer.direction === "to_brand";
  if (isReturn) {
    return NextResponse.json(
      { error: "Only the Brand Owner can confirm delivery of a dispatched Stock Return Note" },
      { status: 403 },
    );
  }
  const receivableStatuses = isReturn ? RETURN_RECEIVABLE_STATUSES : INBOUND_RECEIVABLE_STATUSES;
  if (!receivableStatuses.has(transfer.status)) return NextResponse.json({ error: isReturn ? "Dispatch this return before confirming delivery" : "This document cannot receive stock in its current stage" }, { status: 400 });

  const body = await request.json().catch(() => null) as { items?: ReceiveItemInput[]; note?: string } | null;
  if (!body?.items?.length) return NextResponse.json({ error: "Reconcile at least one item" }, { status: 400 });
  const submittedIds = body.items.map((item) => item.itemId);
  if (new Set(submittedIds).size !== submittedIds.length) {
    return NextResponse.json({ error: "Each transfer item must appear exactly once" }, { status: 400 });
  }
  const usesActualReceiptModel = !isReturn && body.items.some((item) => item.goodQty !== undefined || item.actualVariantId !== undefined || item.unidentifiedQty !== undefined);
  // Audit finding WH-03 (docs/audits/2026-08-20-production-security-
  // correctness-reliability-audit-en.md): usesActualReceiptModel used to be
  // decided purely by which fields the client happened to send — a crafted
  // inbound request sending only receivedOkQty/damagedQty/missingQty
  // silently fell through to the legacy receive_warehouse_document RPC,
  // which mutates stock without an immutable receipt/receipt-line row, a
  // required Idempotency-Key, or wrong-Variant support. Returns
  // (transfer.direction === 'to_brand') are unaffected — the legacy model
  // remains their intended path.
  if (!isReturn && !usesActualReceiptModel) {
    return NextResponse.json(
      { error: "This receipt must use the current receiving form (actual Variant received, per line)." },
      { status: 400 }
    );
  }
  for (const item of body.items) {
    const quantities = usesActualReceiptModel
      ? [item.goodQty ?? 0, item.damagedQty, item.unidentifiedQty ?? 0]
      : [item.receivedOkQty ?? 0, item.damagedQty, item.missingQty ?? 0];
    if (!quantities.every((n) => Number.isInteger(n) && n >= 0)) {
      return NextResponse.json({ error: "Every receipt count must be a whole, non-negative number" }, { status: 400 });
    }
    if (usesActualReceiptModel && !item.actualVariantId && (item.goodQty ?? 0) + item.damagedQty > 0) {
      return NextResponse.json({ error: "Choose the Variant that physically arrived, or record the units as unidentified" }, { status: 400 });
    }
    if (usesActualReceiptModel && (item.unidentifiedQty ?? 0) > 0 && !item.unidentifiedSku?.trim()) {
      return NextResponse.json({ error: "A scanned SKU or package reference is required for unidentified units" }, { status: 400 });
    }
  }

  const { data: expectedItems, error: expectedItemsError } = await supabaseAdmin
    .from("warehouse_transfer_items")
    .select("id, received_ok_qty")
    .eq("transfer_id", params.id)
    .in("id", submittedIds);
  if (expectedItemsError) {
    return safeErrorResponse(
      "admin.warehouse.transfers.receive-items",
      expectedItemsError,
      "Failed to load transfer items"
    );
  }
  const expectedIds = new Set((expectedItems ?? []).filter((item) => item.received_ok_qty == null).map((item) => item.id));
  if (expectedIds.size !== submittedIds.length || submittedIds.some((itemId) => !expectedIds.has(itemId))) {
    return NextResponse.json(
      { error: "Every submitted line must belong to this document and still be awaiting receipt" },
      { status: 400 }
    );
  }

  const operationKey = usesActualReceiptModel
    ? parseOrderIdempotencyKey(request.headers.get("idempotency-key"))
    : null;
  if (usesActualReceiptModel && !operationKey) {
    return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });
  }

  const rpcName = usesActualReceiptModel ? "receive_warehouse_document_v2" : "receive_warehouse_document";
  const rpcArgs = usesActualReceiptModel
    ? {
      p_transfer_id: params.id,
      p_actor_id: receiver.id,
      p_lines: body.items.map((item) => ({
        item_id: item.itemId,
        actual_variant_id: item.actualVariantId ?? null,
        good_qty: item.goodQty ?? 0,
        damaged_qty: item.damagedQty,
        unidentified_qty: item.unidentifiedQty ?? 0,
        unidentified_sku: item.unidentifiedSku?.trim() || null,
        item_note: item.itemNote ?? null,
      })),
      p_note: body.note ?? null,
      p_operation_key: operationKey,
    }
    : {
      p_transfer_id: params.id,
      p_actor_id: receiver.id,
      p_items: body.items.map((item) => ({
        item_id: item.itemId,
        received_ok_qty: item.receivedOkQty ?? 0,
        damaged_qty: item.damagedQty,
        missing_qty: item.missingQty ?? 0,
        item_note: item.itemNote ?? null,
      })),
      p_note: body.note ?? null,
      p_direction: transfer.direction,
    };
  const { data: result, error } = await supabaseAdmin.rpc(rpcName, rpcArgs as never);
  if (error) return safeErrorResponse("admin.warehouse.transfers.receive", error, isReturn ? "Failed to confirm the return" : "Failed to confirm receipt", 400);

  // The RPC above already committed the actual receipt (transfer status +
  // product_variants.quantity) — everything from here on (audit log,
  // Discord mirror, in-app/owner notifications, and above all the
  // back-in-stock email loop in checkAndNotifyRestock, which sends one
  // email per subscriber with no bound on how many that is) is
  // supplementary. Awaiting all of that before responding risked the
  // client seeing a truncated/empty body ("Unexpected end of JSON input")
  // on a slow batch even though the receipt had already succeeded —
  // `after()` runs this work once the response has been sent, so the
  // caller gets `{ok:true, results}` back as soon as the RPC is done.
  after(async () => {
    const { data: brand } = await supabaseAdmin.from("brands").select("slug, name, owner_user_id").eq("id", transfer.brand_id).maybeSingle();

    const { data: itemRows } = await supabaseAdmin
      .from("warehouse_transfer_items")
      .select("id, variant_id, product_variants(sku)")
      .eq("transfer_id", params.id)
      .in("id", body.items!.map((item) => item.itemId));
    const documentResult = (result ?? { items: [], status: "received", remaining_unreconciled: 0 }) as unknown as ReceiveDocumentResult;
    const receivedResults = documentResult.items ?? [];
    const actualVariantIds = [...new Set(receivedResults.map((item) => item.variant_id).filter((id): id is string => Boolean(id)))];
    const { data: actualVariantRows } = actualVariantIds.length
      ? await supabaseAdmin.from("product_variants").select("id, sku").in("id", actualVariantIds)
      : { data: [] as Array<{ id: string; sku: string }> };
    const skuByVariantId = new Map<string, string>([
      ...(itemRows ?? []).map((row) => [row.variant_id as string, (row.product_variants as unknown as { sku: string } | null)?.sku ?? row.variant_id] as const),
      ...(actualVariantRows ?? []).map((row) => [row.id as string, row.sku as string] as const),
    ]);
    const changeSummary = describeInventoryAdjustments(
      receivedResults
        .filter((r) => isReturn ? r.received_ok_qty + r.damaged_qty + r.missing_qty > 0 : r.received_ok_qty > 0)
        .map((r) => {
          const delta = isReturn ? -(r.received_ok_qty + r.damaged_qty + r.missing_qty) : r.received_ok_qty;
          const variantLabel = r.variant_id ? skuByVariantId.get(r.variant_id) ?? r.variant_id : "Unidentified stock";
          return { sku: variantLabel, previousQuantity: r.new_quantity - delta, newQuantity: r.new_quantity };
        })
    );
    const discrepancySummary = receivedResults
      .filter((r) => r.damaged_qty > 0 || r.missing_qty > 0)
      .map((r) => `${r.variant_id ? skuByVariantId.get(r.variant_id) ?? r.variant_id : "Unidentified stock"}: damaged ${r.damaged_qty}, missing ${r.missing_qty}`)
      .join("\n");

    await logAudit({
      actorId: receiver.id,
      actorLabel: receiver.email ?? receiver.id,
      entityType: "warehouse_transfer",
      entityId: params.id,
      action: "approve",
      after: {
        [isReturn ? "Return delivery confirmed" : "Stock received"]: changeSummary || undefined,
        Discrepancies: discrepancySummary || undefined,
        Note: body.note || undefined,
      },
      brandSlug: brand?.slug ?? undefined,
    });

    const hasDiscrepancy = body.items!.some((item) => item.damagedQty > 0 || (item.missingQty ?? 0) > 0 || (item.unidentifiedQty ?? 0) > 0 || (usesActualReceiptModel && item.actualVariantId !== itemRows?.find((row) => row.id === item.itemId)?.variant_id));
    const partial = documentResult.status === "partially_received";
    await notify(
      "warehouse_transfer_received",
      `Local Warehouse ${isReturn ? "return" : "transfer"} ${partial ? "partially confirmed" : "confirmed"}: ${brand?.name ?? ""}${hasDiscrepancy ? " (with discrepancies)" : ""}`,
      [isReturn ? (partial ? "Confirmed units moved from in-transit stock into brand stock." : "Delivered units moved from in-transit stock into brand stock.") : "", body.note].filter(Boolean).join("\n\n"),
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
        partial
          ? `Zakhnook partially confirmed your ${isReturn ? "return delivery" : "restock document"}`
          : isReturn
            ? (hasDiscrepancy ? "Your return was confirmed — with some discrepancies" : "Your return was confirmed in full")
            : (hasDiscrepancy ? "Your transfer was received — with some discrepancies" : "Your transfer was received in full"),
        [isReturn ? (partial ? "The confirmed units are now in your brand stock; the remaining units stay in transit." : "The delivered units are now recorded in your brand stock.") : "", body.note].filter(Boolean).join("\n\n"),
        { relatedEntityType: "warehouse_transfer", relatedEntityId: params.id }
      );
    }

    if (!isReturn) {
      const variantIds = receivedResults
        .filter((r) => r.received_ok_qty > 0 && r.variant_id)
        .map((r) => r.variant_id as string);
      if (variantIds.length) await checkAndNotifyRestock(variantIds);
    }
  });

  return NextResponse.json({ ok: true, result });
}
