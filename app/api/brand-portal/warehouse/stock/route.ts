import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";

type Update = { variantId: string; brandStockQuantity: number };

// Purely informational bookkeeping — "how much of this do you have in your
// own warehouse right now" — never read by the storefront/checkout. Not
// audited/notified like a real inventory change; it's closer to editing a
// draft field than a consequential write.
export async function PATCH(request: NextRequest) {
  const owner = await requireBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.isImpersonating) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!owner.isMahalyPartner) return NextResponse.json({ error: "This brand isn't a Mahaly Partner" }, { status: 403 });
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

  const ids = [...new Set(body.updates.map((u) => u.variantId))];
  const { data: owned } = await supabaseAdmin
    .from("product_variants")
    .select("id, products!inner(brand_id)")
    .in("id", ids)
    .eq("products.brand_id", owner.brandId);
  if ((owned?.length ?? 0) !== ids.length) {
    return NextResponse.json({ error: "A selected variant is not available for this brand" }, { status: 403 });
  }

  for (const update of body.updates) {
    const { error } = await supabaseAdmin
      .from("product_variants")
      .update({ brand_stock_quantity: update.brandStockQuantity, updated_at: new Date().toISOString() })
      .eq("id", update.variantId);
    if (error) return safeErrorResponse("brand-portal.warehouse.stock", error, "Failed to save your warehouse stock");
  }

  return NextResponse.json({ ok: true });
}
