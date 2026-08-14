import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { replenishmentErrorResponse } from "@/lib/warehouse/replenishmentErrorResponse";

// Server-side, paginated/filterable/sortable/grouped read model backing the
// partner Inventory page (app/brand-portal/stock/page.tsx +
// components/brand-portal/InventoryManager.tsx) — see
// supabase/migrations/20260814010500_partner_replenishment_request.sql's
// brand_portal_inventory_page for the full pagination/grouping contract
// (product-group cursor pagination, per-variant sales/insight fields,
// unfiltered summary counts for the health cards). This route only
// translates the page's own URL vocabulary (level=all/healthy/low/out,
// sort=risk/sales/''/stock-asc/stock-desc — unchanged, so existing
// bookmarked/shared URLs keep working) into the RPC's internal vocabulary,
// and opaque-encodes the RPC's small {productId, sortValue} cursor object
// as a single base64url query-string token.

const LEVEL_TO_STOCK_STATUS: Record<string, string> = {
  all: "all",
  healthy: "in_stock",
  low: "low_stock",
  out: "out_of_stock",
};
const SORT_TO_RPC_SORT: Record<string, string> = {
  risk: "risk",
  sales: "sales",
  "": "name",
  "stock-asc": "stock_asc",
  "stock-desc": "stock_desc",
};

interface InventoryPageResult {
  items: unknown[];
  nextCursor: { productId: string; sortValue: string } | null;
  hasMore: boolean;
  summary: {
    totalVariantCount: number;
    totalAvailableUnits: number;
    healthyCount: number;
    lowStockCount: number;
    outOfStockCount: number;
    matchingResultCount: number;
  };
}

export async function GET(request: NextRequest) {
  const owner = await requireActiveBrandOwner(request.nextUrl.searchParams.get("brand") ?? undefined);
  if (!owner?.brandId || owner.isImpersonating) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  if (!owner.isMahalyPartner) return NextResponse.json({ error: "This brand isn't a Zakhnook Partner" }, { status: 403 });
  if (!checkRateLimit(`inventory-variants:${owner.user.id}`, 180, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const search = params.get("q")?.trim() || null;
  const level = params.get("level") ?? "all";
  const sort = params.get("sort") ?? "risk";
  const pageSizeParam = params.get("pageSize");
  const pageSize = pageSizeParam ? Number(pageSizeParam) : 10;
  const cursorParam = params.get("cursor");
  const productId = params.get("product") || null;

  const stockStatus = LEVEL_TO_STOCK_STATUS[level];
  if (!stockStatus) {
    return NextResponse.json({ error: "That stock status filter isn't valid.", code: "INVALID_STOCK_STATUS_FILTER" }, { status: 400 });
  }
  const rpcSort = SORT_TO_RPC_SORT[sort];
  if (!rpcSort) {
    return NextResponse.json({ error: "That sort option isn't valid.", code: "INVALID_SORT" }, { status: 400 });
  }
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    return NextResponse.json({ error: "Page size must be a positive whole number.", code: "INVALID_LIMIT" }, { status: 400 });
  }

  let cursor: { productId: string; sortValue: string } | null = null;
  if (cursorParam) {
    try {
      const parsed = JSON.parse(Buffer.from(cursorParam, "base64url").toString("utf8")) as unknown;
      if (
        typeof parsed === "object" && parsed !== null &&
        typeof (parsed as { productId?: unknown }).productId === "string" &&
        typeof (parsed as { sortValue?: unknown }).sortValue === "string"
      ) {
        cursor = parsed as { productId: string; sortValue: string };
      } else {
        throw new Error("shape");
      }
    } catch {
      return NextResponse.json({ error: "That page reference isn't valid — start from the first page again.", code: "INVALID_CURSOR" }, { status: 400 });
    }
  }

  const { data, error } = await supabaseAdmin.rpc("brand_portal_inventory_page", {
    p_brand_id: owner.brandId,
    p_search: search,
    p_stock_status: stockStatus,
    p_sort: rpcSort,
    p_cursor: cursor,
    p_page_size: pageSize,
    p_product_id: productId,
  } as never);
  if (error) return replenishmentErrorResponse("brand-portal.inventory.variants", error);

  const result = data as InventoryPageResult;
  const nextCursor = result.nextCursor
    ? Buffer.from(JSON.stringify(result.nextCursor), "utf8").toString("base64url")
    : null;

  return NextResponse.json({ items: result.items, nextCursor, hasMore: result.hasMore, summary: result.summary });
}
