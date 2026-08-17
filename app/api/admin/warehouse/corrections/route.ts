import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { checkAndNotifyRestock } from "@/lib/backInStock";
import { parseOrderIdempotencyKey } from "@/lib/orders/idempotency";

// The ONE legitimate way for warehouse/admin staff to correct Zakhnook-held
// sellable stock (product_variants.quantity for a zakhnook_fulfilled
// brand's variant) outside a warehouse receipt — apply_inventory_adjustments
// rejects this brand-mode outright (see supabase/migrations/
// 20260814000005_inventory_permission_boundaries.sql). Always requires a
// reason; always tagged movement_type='admin_correction',
// related_entity_type='warehouse_correction' in the ledger.
export async function POST(request: NextRequest) {
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    transferId?: string;
    correctionType?: string;
    reasonCode?: string;
    lines?: Array<{
      action?: string;
      fromVariantId?: string | null;
      toVariantId?: string | null;
      quantity?: number;
      sourceReceiptLineId?: string | null;
      sourceBucket?: "damaged" | "missing" | "substitution" | "excess" | "unidentified" | null;
      note?: string;
    }>;
    variantId?: string;
    delta?: number;
    reason?: string;
    note?: string;
  } | null;

  const operationKey = parseOrderIdempotencyKey(request.headers.get("idempotency-key"));
  if (!operationKey) return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });

  if (body?.transferId) {
    const correctionTypes = new Set(["reclassification", "quantity_adjustment", "missing_recovery", "condition_resolution", "reversal"]);
    const reasonCodes = new Set(["wrong_variant", "count_error", "duplicate_receipt", "missing_found", "damage_regraded", "return_to_brand", "write_off", "document_error", "other"]);
    const actions = new Set(["reclassify", "adjust_in", "adjust_out", "restore_to_sellable", "return_to_brand", "write_off", "accept_discrepancy"]);
    if (!body.correctionType || !correctionTypes.has(body.correctionType)) {
      return NextResponse.json({ error: "Choose a valid correction type" }, { status: 400 });
    }
    if (!body.reasonCode || !reasonCodes.has(body.reasonCode)) {
      return NextResponse.json({ error: "Choose a valid correction reason" }, { status: 400 });
    }
    if (!body.reason?.trim() || body.reason.trim().length < 5) {
      return NextResponse.json({ error: "Explain the error and the correct physical situation" }, { status: 400 });
    }
    if (!body.lines?.length || body.lines.some((line) => !line.action || !actions.has(line.action) || !Number.isInteger(line.quantity) || (line.quantity ?? 0) <= 0)) {
      return NextResponse.json({ error: "At least one valid positive-quantity correction line is required" }, { status: 400 });
    }

    const { data: result, error } = await supabaseAdmin.rpc("request_warehouse_correction", {
      p_transfer_id: body.transferId,
      p_actor_id: receiver.id,
      p_correction_type: body.correctionType,
      p_reason_code: body.reasonCode,
      p_note: body.reason.trim(),
      p_lines: body.lines.map((line) => ({
        action: line.action,
        from_variant_id: line.fromVariantId ?? null,
        to_variant_id: line.toVariantId ?? null,
        quantity: line.quantity,
        source_receipt_line_id: line.sourceReceiptLineId ?? null,
        source_bucket: line.sourceBucket ?? null,
        note: line.note?.trim() || null,
      })),
      p_operation_key: operationKey,
    } as never);
    if (error) return safeErrorResponse("admin.warehouse.corrections.request", error, "Failed to create the correction document", 400);

    const correction = result as { correctionId?: string; correctionNumber?: string; status?: string };
    await logAudit({
      actorId: receiver.id,
      actorLabel: receiver.email ?? receiver.id,
      entityType: "warehouse_transfer",
      entityId: body.transferId,
      action: "update",
      after: {
        "Correction requested": correction.correctionNumber ?? correction.correctionId,
        Type: body.correctionType,
        Reason: body.reasonCode,
      },
    });
    return NextResponse.json(result);
  }

  if (!body?.variantId || typeof body.delta !== "number" || !Number.isInteger(body.delta) || body.delta === 0) {
    return NextResponse.json({ error: "variantId and a non-zero whole-number delta are required" }, { status: 400 });
  }
  if (!body.reason?.trim()) {
    return NextResponse.json({ error: "A reason is required for a warehouse stock correction" }, { status: 400 });
  }
  const delta = body.delta;
  const reason = body.reason;

  const { data: result, error } = await supabaseAdmin.rpc("apply_warehouse_stock_correction", {
    p_variant_id: body.variantId,
    p_actor_id: receiver.id,
    p_delta: delta,
    p_reason: reason,
    p_note: body.note ?? null,
    p_operation_key: operationKey,
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.corrections", error, "Failed to apply the correction", 400);

  const { variant_id: variantId, new_quantity: newQuantity } = result as { variant_id: string; new_quantity: number };

  await logAudit({
    actorId: receiver.id,
    actorLabel: receiver.email ?? receiver.id,
    entityType: "inventory",
    entityId: variantId,
    action: "update",
    after: { "Warehouse correction": `${delta > 0 ? "+" : ""}${delta}`, Reason: reason },
  });

  if (delta > 0 && newQuantity > 0) await checkAndNotifyRestock([variantId]);

  return NextResponse.json(result);
}
