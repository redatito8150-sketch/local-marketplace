import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { validateInventoryAdjustment } from "@/lib/inventory/adjustmentValidation";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { checkAndNotifyRestock } from "@/lib/backInStock";
import { describeInventoryAdjustments } from "@/lib/admin/describeInventoryAdjustment";

type Adjustment = { variantId: string; type: "add" | "remove" | "set"; amount: number; currentQuantity: number };

export async function POST(request: NextRequest) {
  const owner = await requireBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.isImpersonating) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!checkRateLimit(`inventory-adjustment:${owner.user.id}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }
  const body = await request.json().catch(() => null) as { adjustments?: Adjustment[]; reason?: string; note?: string } | null;
  if (!body?.adjustments?.length) return NextResponse.json({ error: "Select at least one variant" }, { status: 400 });
  for (const adjustment of body.adjustments) {
    const error = validateInventoryAdjustment({ ...adjustment, reason: body.reason ?? "" });
    if (error) return NextResponse.json({ error }, { status: 400 });
  }
  const ids = [...new Set(body.adjustments.map((item) => item.variantId))];
  const { data: owned } = await supabaseAdmin
    .from("product_variants")
    .select("id, sku, quantity, products!inner(brand_id)")
    .in("id", ids)
    .eq("products.brand_id", owner.brandId);
  if ((owned?.length ?? 0) !== ids.length) return NextResponse.json({ error: "A selected variant is not available for this brand" }, { status: 403 });

  // Mahaly Partner brands keep their site-visible stock in Mahaly's own
  // warehouse — it can only ever go up via a confirmed Local Warehouse
  // transfer receipt, never a direct adjustment here. "remove"
  // (correction/damage/loss going down) still passes through untouched.
  if (owner.isMahalyPartner) {
    const quantityById = new Map((owned ?? []).map((row) => [row.id as string, row.quantity as number]));
    for (const adjustment of body.adjustments) {
      const currentQty = quantityById.get(adjustment.variantId) ?? 0;
      const wouldIncrease = adjustment.type === "add" || (adjustment.type === "set" && adjustment.amount > currentQty);
      if (wouldIncrease) {
        return NextResponse.json(
          { error: "This brand's stock can only increase through a Local Warehouse transfer — request one instead." },
          { status: 400 }
        );
      }
    }
  }

  const operationKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
  const { data, error } = await supabaseAdmin.rpc("apply_inventory_adjustments", {
    p_brand_id: owner.brandId,
    p_actor_id: owner.user.id,
    p_adjustments: body.adjustments.map((item) => ({ variant_id: item.variantId, type: item.type, amount: item.amount })),
    p_reason: body.reason,
    p_note: body.note ?? null,
    p_source: "brand_portal",
    p_operation_key: operationKey,
  } as never);
  if (error) return safeErrorResponse("brand-portal.inventory.adjustments", error, "Failed to apply the adjustment", 400);

  const skuById = new Map((owned ?? []).map((row) => [row.id as string, row.sku as string]));
  const results = (data ?? []) as { variant_id: string; previous_quantity: number; new_quantity: number }[];
  const changeLines = results.map((r) => ({
    sku: skuById.get(r.variant_id) ?? r.variant_id,
    previousQuantity: r.previous_quantity,
    newQuantity: r.new_quantity,
  }));

  await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "inventory",
    entityId: owner.brandId,
    action: "restock",
    after: {
      Reason: body.reason,
      Note: body.note || undefined,
      Changes: describeInventoryAdjustments(changeLines),
    },
    brandSlug: owner.brandSlug ?? undefined,
  });
  // Re-verifies purchasability itself and no-ops for anything that isn't
  // actually purchasable now or has no waiting subscribers — safe (and
  // cheap) to call for every touched variant rather than pre-filtering.
  await checkAndNotifyRestock(ids);
  return NextResponse.json({ adjustments: data });
}
