import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";

type Update = { variantId: string; brandStockQuantity: number };

// Purely informational bookkeeping — "how much of this do you have in your
// own warehouse right now" — never read by the storefront/checkout. Not
// audited/notified like a real inventory change; it's closer to editing a
// draft field than a consequential write.
export async function PATCH(request: NextRequest) {
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.isImpersonating) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!owner.isMahalyPartner) return NextResponse.json({ error: "This brand isn't a Zakhnook Partner" }, { status: 403 });
  if (!checkRateLimit(`warehouse-stock:${owner.user.id}`, 60, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { updates?: Update[] } | null;
  if (!body?.updates?.length) return NextResponse.json({ error: "Select at least one variant" }, { status: 400 });
  for (const update of body.updates) {
    if (!Number.isInteger(update.brandStockQuantity) || update.brandStockQuantity < 0) {
      return NextResponse.json({ error: "Quantity must be a whole, non-negative number" }, { status: 400 });
    }
  }

  if (new Set(body.updates.map((update) => update.variantId)).size !== body.updates.length) {
    return NextResponse.json({ error: "Each variant can appear only once" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.rpc("set_warehouse_brand_stock", {
    p_brand_id: owner.brandId,
    p_actor_id: owner.user.id,
    p_updates: body.updates.map((update) => ({
      variant_id: update.variantId,
      brand_stock_quantity: update.brandStockQuantity,
    })),
  });
  if (error) {
    return safeErrorResponse(
      "brand-portal.warehouse.stock",
      error,
      "Failed to save your warehouse stock",
      400
    );
  }

  return NextResponse.json({ ok: true });
}
