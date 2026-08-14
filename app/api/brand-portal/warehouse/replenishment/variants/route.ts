import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { replenishmentErrorResponse } from "@/lib/warehouse/replenishmentErrorResponse";

const SORT_VALUES = new Set([
  "name_asc",
  "name_desc",
  "incoming_asc",
  "incoming_desc",
  "available_asc",
  "available_desc",
]);
const STOCK_STATUS_VALUES = new Set(["all", "in_stock", "low_stock", "out_of_stock", "incoming", "no_incoming"]);

// Server-side, paginated/filterable/sortable companion to
// lib/data/warehouse.ts's getBrandWarehouseVariants (which loads every
// variant unpaginated) — the read model for the document-first
// replenishment workflow (see supabase/migrations/
// 20260814010500_partner_replenishment_request.sql's
// brand_portal_replenishment_variants). Deliberately a NEW route rather
// than a change to the existing unpaginated call site, since
// app/brand-portal/warehouse/page.tsx and lib/data/warehouse.ts are owned
// by concurrent UI work — see that migration's header comment and this
// branch's final report for the full contract (request/response shape,
// cursor semantics) Codex's UI can adopt.
export async function GET(request: NextRequest) {
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.isImpersonating) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!owner.isMahalyPartner) return NextResponse.json({ error: "This brand isn't a Zakhnook Partner" }, { status: 403 });
  if (!checkRateLimit(`warehouse-replenishment-variants:${owner.user.id}`, 120, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const search = params.get("search")?.trim() || null;
  const stockStatus = params.get("stockStatus") ?? "all";
  const sort = params.get("sort") ?? "name_asc";
  const limitParam = params.get("limit");
  const limit = limitParam ? Number(limitParam) : 25;
  const cursorParam = params.get("cursor");

  if (!STOCK_STATUS_VALUES.has(stockStatus)) {
    return NextResponse.json({ error: "That stock status filter isn't valid.", code: "INVALID_STOCK_STATUS_FILTER" }, { status: 400 });
  }
  if (!SORT_VALUES.has(sort)) {
    return NextResponse.json({ error: "That sort option isn't valid.", code: "INVALID_SORT" }, { status: 400 });
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    return NextResponse.json({ error: "Limit must be a positive whole number.", code: "INVALID_LIMIT" }, { status: 400 });
  }

  let cursor: { id: string; sortValue: string } | null = null;
  if (cursorParam) {
    try {
      const parsed = JSON.parse(Buffer.from(cursorParam, "base64url").toString("utf8")) as unknown;
      if (
        typeof parsed === "object" && parsed !== null &&
        typeof (parsed as { id?: unknown }).id === "string" &&
        typeof (parsed as { sortValue?: unknown }).sortValue === "string"
      ) {
        cursor = parsed as { id: string; sortValue: string };
      } else {
        throw new Error("shape");
      }
    } catch {
      return NextResponse.json({ error: "That page reference isn't valid — start from the first page again.", code: "INVALID_CURSOR" }, { status: 400 });
    }
  }

  const { data, error } = await supabaseAdmin.rpc("brand_portal_replenishment_variants", {
    p_brand_id: owner.brandId,
    p_search: search,
    p_stock_status: stockStatus,
    p_sort: sort,
    p_cursor: cursor,
    p_limit: limit,
  } as never);
  if (error) return replenishmentErrorResponse("brand-portal.warehouse.replenishment.variants", error);

  const result = data as { items: unknown[]; nextCursor: { id: string; sortValue: string } | null; hasMore: boolean };
  const nextCursor = result.nextCursor
    ? Buffer.from(JSON.stringify(result.nextCursor), "utf8").toString("base64url")
    : null;

  return NextResponse.json({ items: result.items, nextCursor, hasMore: result.hasMore });
}
