import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateInventoryAdjustment } from "@/lib/inventory/adjustmentValidation";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { checkAndNotifyRestock } from "@/lib/backInStock";
import { describeInventoryAdjustments } from "@/lib/admin/describeInventoryAdjustment";

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
  const { data: rows } = await supabaseAdmin.from("product_variants").select("id, sku, quantity, products!inner(brand_id)").in("id", ids);
  const brandIds = [...new Set((rows ?? []).map((row) => (row.products as unknown as { brand_id: string }).brand_id))];
  if ((rows?.length ?? 0) !== ids.length || brandIds.length !== 1) {
    return NextResponse.json({ error: "All selected variants must exist and belong to one brand" }, { status: 400 });
  }

  // Same rule as the brand-portal route: a Mahaly Partner brand's stock can
  // only increase through a confirmed Local Warehouse transfer, even from
  // the admin panel's general adjustment tool — otherwise the transfer
  // ledger's discrepancy tracking could always be silently bypassed here.
  const { data: brandRow } = await supabaseAdmin.from("brands").select("is_mahaly_partner").eq("id", brandIds[0]).maybeSingle();
  if (brandRow?.is_mahaly_partner) {
    const quantityById = new Map((rows ?? []).map((row) => [row.id as string, row.quantity as number]));
    for (const adjustment of body.adjustments) {
      const currentQty = quantityById.get(adjustment.variantId) ?? 0;
      const wouldIncrease = adjustment.type === "add" || (adjustment.type === "set" && adjustment.amount > currentQty);
      if (wouldIncrease) {
        return NextResponse.json(
          { error: "This brand's stock can only increase through a Local Warehouse transfer receipt." },
          { status: 400 }
        );
      }
    }
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

  const skuById = new Map((rows ?? []).map((row) => [row.id as string, row.sku as string]));
  const results = (data ?? []) as { variant_id: string; previous_quantity: number; new_quantity: number }[];
  const changeLines = results.map((r) => ({
    sku: skuById.get(r.variant_id) ?? r.variant_id,
    previousQuantity: r.previous_quantity,
    newQuantity: r.new_quantity,
  }));

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "inventory",
    entityId: brandIds[0],
    action: "restock",
    after: {
      Reason: body.reason,
      Note: body.note || undefined,
      Changes: describeInventoryAdjustments(changeLines),
    },
  });
  await checkAndNotifyRestock(ids);
  return NextResponse.json({ adjustments: data });
}
