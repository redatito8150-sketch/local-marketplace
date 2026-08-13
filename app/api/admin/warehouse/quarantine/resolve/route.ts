import { NextRequest, NextResponse } from "next/server";
import { requireWarehouseReceiver } from "@/lib/supabase/warehouseAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { parseOrderIdempotencyKey } from "@/lib/orders/idempotency";

// The real, authenticated entry point for resolve_warehouse_quarantine
// (supabase/migrations/20260814000003_warehouse_documents.sql) — until
// this route existed, nothing called that RPC at all; warehouse/admin
// staff had no way to actually close out a damaged/missing line, and
// enforce_variant_archive_safety's "unresolved quarantine" block
// (20260814000005_inventory_permission_boundaries.sql) had no real path
// to ever clear. Gated the same way as every other warehouse RPC —
// requireWarehouseReceiver() (admin, or a user holding the
// manage_inventory permission) — never reachable by a brand-portal actor.
export async function POST(request: NextRequest) {
  const receiver = await requireWarehouseReceiver();
  if (!receiver) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as {
    transferItemId?: string;
    resolution?: string;
    note?: string;
  } | null;

  if (!body?.transferItemId) {
    return NextResponse.json({ error: "transferItemId is required" }, { status: 400 });
  }
  if (body.resolution !== "written_off" && body.resolution !== "returned_to_brand" && body.resolution !== "restored_to_sellable") {
    return NextResponse.json(
      { error: "resolution must be one of written_off, returned_to_brand, restored_to_sellable" },
      { status: 400 }
    );
  }
  if (!body.note?.trim()) {
    return NextResponse.json({ error: "A note is required to resolve a quarantine line" }, { status: 400 });
  }

  const operationKey = parseOrderIdempotencyKey(request.headers.get("idempotency-key"));
  if (!operationKey) return NextResponse.json({ error: "A valid Idempotency-Key header is required" }, { status: 400 });

  const { data: result, error } = await supabaseAdmin.rpc("resolve_warehouse_quarantine", {
    p_transfer_item_id: body.transferItemId,
    p_actor_id: receiver.id,
    p_resolution: body.resolution,
    p_note: body.note,
    p_operation_key: operationKey,
  } as never);
  if (error) return safeErrorResponse("admin.warehouse.quarantine.resolve", error, "Failed to resolve the quarantine line", 400);

  await logAudit({
    actorId: receiver.id,
    actorLabel: receiver.email ?? receiver.id,
    entityType: "warehouse_transfer",
    entityId: body.transferItemId,
    action: "update",
    after: { "Quarantine resolution": body.resolution, Note: body.note },
  });

  return NextResponse.json(result);
}
