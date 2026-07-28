import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { validateInventoryAdjustment } from "@/lib/inventory/adjustmentValidation";

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
    .select("id, products!inner(brand_id)")
    .in("id", ids)
    .eq("products.brand_id", owner.brandId);
  if ((owned?.length ?? 0) !== ids.length) return NextResponse.json({ error: "A selected variant is not available for this brand" }, { status: 403 });

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
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ adjustments: data });
}
