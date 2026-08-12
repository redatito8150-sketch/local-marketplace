import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { safeErrorResponse } from "@/lib/apiError";

// "Cancel this whole purchase" — admin-only for now (see the Master Order
// Phase 1 plan: no customer-facing cancel-whole-purchase UI exists yet,
// that's new UI space touching an undecided return/cancellation policy).
// Wraps cancel_order_group(), which loops every sibling order and cancels
// what it still can — an already-shipped/fulfilled/cancelled sibling is
// reported as skipped, never aborting the whole batch.
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin.rpc("cancel_order_group", {
    p_master_order_id: params.id,
  });

  if (error) {
    if (error.message?.startsWith("MASTER_ORDER_NOT_FOUND")) {
      return NextResponse.json({ error: "Master order not found" }, { status: 404 });
    }
    return safeErrorResponse("admin.master-orders.cancel", error, "Failed to cancel purchase");
  }

  const result = data as { cancelled_order_ids: string[]; skipped_order_ids: string[] };

  // No dedicated "master_order" audit entity type exists — cancelling a
  // whole purchase is fundamentally an order-status-change event, so this
  // reuses "order" (same Discord channel, same admin-URL resolution) with
  // the master order id as the entity id, rather than expanding
  // AuditEntityType for one route.
  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "order",
    entityId: params.id,
    action: "status_change",
    after: { cancelledOrderIds: result.cancelled_order_ids, skippedOrderIds: result.skipped_order_ids },
  });

  return NextResponse.json({
    cancelledOrderIds: result.cancelled_order_ids,
    skippedOrderIds: result.skipped_order_ids,
  });
}
