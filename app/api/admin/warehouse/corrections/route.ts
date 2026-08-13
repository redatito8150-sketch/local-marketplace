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
    variantId?: string;
    delta?: number;
    reason?: string;
    note?: string;
  } | null;
  if (!body?.variantId || typeof body.delta !== "number" || !Number.isInteger(body.delta) || body.delta === 0) {
    return NextResponse.json({ error: "variantId and a non-zero whole-number delta are required" }, { status: 400 });
  }
  if (!body.reason?.trim()) {
    return NextResponse.json({ error: "A reason is required for a warehouse stock correction" }, { status: 400 });
  }
  const delta = body.delta;
  const reason = body.reason;

  const operationKey = parseOrderIdempotencyKey(request.headers.get("idempotency-key"));
  if (!operationKey) return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });

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
