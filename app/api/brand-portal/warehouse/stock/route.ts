import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";

// DISABLED (this branch's document-first replenishment change — see
// supabase/migrations/20260814010500_partner_replenishment_request.sql's
// header comment). This endpoint let a brand freely overwrite its own
// declared product_variants.brand_stock_quantity — the exact "held by your
// brand" prerequisite that used to gate request_warehouse_transfer and has
// now been removed from that RPC. Since nothing checks brand_stock_quantity
// as a prerequisite for ordinary partner replenishment anymore, letting
// brands keep editing it here would be a dead, misleading write (the number
// would no longer mean anything to the workflow) — safer to refuse the
// write outright than to silently accept it into a field nothing reads.
//
// The underlying RPC (public.set_warehouse_brand_stock) is left fully
// intact and reachable by service_role — only this brand-facing HTTP route
// is turned off — so it remains available for any other legitimate
// service_role-side reconciliation path without a migration change, and
// existing historical brand_stock_quantity values and open documents are
// completely unaffected by disabling this route.
//
// Returns a stable machine-readable code (MANUAL_STOCK_OVERWRITE_DISABLED)
// so a caller can distinguish "this feature is gone" from an ordinary
// validation/auth failure. Kept behind the same auth/partner gate as
// before (rather than 404ing) so the safe, specific message is what a
// legitimate brand owner actually sees.
export async function PATCH(request: NextRequest) {
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.isImpersonating) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!owner.isMahalyPartner) return NextResponse.json({ error: "This brand isn't a Zakhnook Partner" }, { status: 403 });

  return NextResponse.json(
    {
      error: "Manually editing warehouse stock is no longer supported — submit a replenishment request instead.",
      code: "MANUAL_STOCK_OVERWRITE_DISABLED",
    },
    { status: 410 }
  );
}
