import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateInventoryAdjustment } from "@/lib/inventory/adjustmentValidation";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";

type Adjustment = { variantId: string; type: "add" | "remove" | "set"; amount: number; currentQuantity: number };

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const body = await request.json().catch(() => null) as { adjustments?: Adjustment[]; reason?: string; note?: string } | null;
  if (!body?.adjustments?.length) return NextResponse.json({ error: "Select at least one variant" }, { status: 400 });
  for (const adjustment of body.adjustments) {
    const error = validateInventoryAdjustment({ ...adjustment, reason: body.reason ?? "" });
    if (error) return NextResponse.json({ error }, { status: 400 });
  }
  const ids = [...new Set(body.adjustments.map((item) => item.variantId))];
  const { data: rows } = await supabaseAdmin.from("product_variants").select("id, products!inner(brand_id)").in("id", ids);
  const brandIds = [...new Set((rows ?? []).map((row) => (row.products as unknown as { brand_id: string }).brand_id))];
  if ((rows?.length ?? 0) !== ids.length || brandIds.length !== 1) {
    return NextResponse.json({ error: "All selected variants must exist and belong to one brand" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin.rpc("apply_inventory_adjustments", {
    p_brand_id: brandIds[0],
    p_actor_id: admin.id,
    p_adjustments: body.adjustments.map((item) => ({ variant_id: item.variantId, type: item.type, amount: item.amount })),
    p_reason: body.reason,
    p_note: body.note ?? null,
    p_source: "admin",
    p_operation_key: request.headers.get("idempotency-key") ?? crypto.randomUUID(),
  } as never);
  if (error) return safeErrorResponse("admin.inventory.adjustments", error, "Failed to apply the adjustment", 400);
  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "inventory",
    entityId: brandIds[0],
    action: "restock",
    after: { adjustments: body.adjustments, reason: body.reason, note: body.note ?? undefined },
  });
  return NextResponse.json({ adjustments: data });
}
