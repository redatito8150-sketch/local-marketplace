import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getInventoryHistoryForBrand, getInventoryPageForBrand, getVariantsForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import { DashboardEmptyState, DashboardPageHeader } from "@/components/dashboard/DashboardUI";
import InventoryManager from "@/components/brand-portal/InventoryManager";
import AutoSubmitForm from "@/components/dashboard/AutoSubmitForm";
import { getBrandWarehouseVariants } from "@/lib/data/warehouse";

type StockParams = {
  brand?: string; q?: string; level?: string; sort?: string; product?: string; view?: string;
  cursor?: string; back?: string;
};
type StockLevel = "all" | "healthy" | "low" | "out";
const INVENTORY_PAGE_SIZE = 10;

const filterControl = "h-10 min-w-0 rounded-xl border border-[#e5ddd5] bg-white px-3 text-[11.5px] font-semibold text-[#51473f] outline-none transition-[border-color,background-color,box-shadow] placeholder:font-normal placeholder:text-[#9b8d82] hover:border-[#d8ccc3] focus:border-[#C85956]/45 focus:outline-none focus:ring-4 focus:ring-[#C85956]/8";

const LEVEL_TO_STOCK_STATUS = { all: "all", healthy: "in_stock", low: "low_stock", out: "out_of_stock" } as const;
const SORT_TO_RPC_SORT = { risk: "risk", sales: "sales", "": "name", "stock-asc": "stock_asc", "stock-desc": "stock_desc" } as const;

function parseBackStack(raw?: string): string[] {
  return raw ? raw.split(",").filter(Boolean) : [];
}

export default async function BrandPortalStockPage(props: { searchParams: Promise<StockParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandSlug) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />;
  }

  const query = params.q?.trim();
  const activeLevel = (["healthy", "low", "out"].includes(params.level ?? "") ? params.level : "all") as StockLevel;
  const view = params.view === "activity" ? "activity" : "inventory";
  const activeSort = (params.sort ?? "risk") as keyof typeof SORT_TO_RPC_SORT;
  const backStack = parseBackStack(params.back);

  // Bounded regardless of catalog size (getInventoryHistoryForBrand caps at
  // the most recent 100 movements) — safe to always fetch, since the
  // Activity tab's own unread badge count needs it even while viewing
  // Inventory. getVariantsForBrand (the brand's ENTIRE active catalog) is
  // only fetched when the Activity tab is actually open, to label each
  // movement row with a product name/SKU — never on an Inventory view.
  const [history, inventoryResult, activityLabelVariants, returnVariants] = await Promise.all([
    getInventoryHistoryForBrand(owner.brandId!, owner.isImpersonating),
    view === "inventory"
      ? getInventoryPageForBrand(owner.brandId!, {
          search: query,
          stockStatus: LEVEL_TO_STOCK_STATUS[activeLevel],
          sort: SORT_TO_RPC_SORT[activeSort] ?? "risk",
          cursor: params.cursor ?? null,
          pageSize: INVENTORY_PAGE_SIZE,
          productId: params.product,
        })
      : Promise.resolve(null),
    view === "activity" ? getVariantsForBrand(owner.brandSlug, owner.isImpersonating) : Promise.resolve([]),
    view === "inventory" && owner.isMahalyPartner && owner.accessLevel === "owner" && !owner.isImpersonating
      ? getBrandWarehouseVariants(owner.brandId!)
      : Promise.resolve([]),
  ]);

  const variants = inventoryResult?.variants ?? [];
  const summary = inventoryResult?.summary;
  const activeFilterCount = [params.q, activeLevel !== "all" ? activeLevel : undefined, params.sort, params.product].filter(Boolean).length;

  const href = (changes: Partial<StockParams>) => {
    const next = new URLSearchParams();
    if (owner.isImpersonating) next.set("brand", owner.brandSlug!);
    if (params.q) next.set("q", params.q);
    if (activeLevel !== "all") next.set("level", activeLevel);
    if (params.sort) next.set("sort", params.sort);
    if (params.product) next.set("product", params.product);
    if (params.cursor) next.set("cursor", params.cursor);
    if (params.back) next.set("back", params.back);
    if (view === "activity") next.set("view", "activity");
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
    return `/brand-portal/stock${next.size ? `?${next}` : ""}`;
  };
  // Filters/search/sort always land back on page 1 — same semantics as the
  // old OFFSET pager's `page: undefined` reset, just expressed as clearing
  // the cursor/back-stack instead of a page number.
  const filterHref = (changes: Partial<StockParams>) => href({ ...changes, cursor: undefined, back: undefined });
  const nextHref = inventoryResult?.nextCursor
    ? href({ cursor: inventoryResult.nextCursor, back: (params.cursor ? [...backStack, params.cursor] : backStack).join(",") || undefined })
    : undefined;
  const previousHref = params.cursor
    ? href({
        cursor: backStack.length ? backStack[backStack.length - 1] : undefined,
        back: backStack.slice(0, -1).join(",") || undefined,
      })
    : undefined;

  const levels: Array<{ key: StockLevel; label: string; count: number; tone: string }> = summary ? [
    { key: "all", label: "All variants", count: summary.totalVariantCount, tone: "bg-[#C85956]" },
    { key: "healthy", label: "Healthy", count: summary.healthyCount, tone: "bg-emerald-500" },
    { key: "low", label: "Low stock", count: summary.lowStockCount, tone: "bg-amber-500" },
    { key: "out", label: "Out of stock", count: summary.outOfStockCount, tone: "bg-red-500" },
  ] : [];

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader
        eyebrow={view === "activity" ? "Inventory" : owner.isMahalyPartner ? "Zakhnook fulfilled" : "Brand fulfilled"}
        title={view === "activity" ? "Variant movements" : "Inventory"}
        description={view === "activity"
          ? "Trace every stock change back to its Variant, reason, source and recorded time."
          : owner.isMahalyPartner
            ? "Track the stock physically available at Zakhnook. New units become sellable only after a shipment is received."
            : "Manage the stock you fulfil directly, catch risks early, and keep every variant accurate."}
      />

      {view === "inventory" && <>
        <AutoSubmitForm action="/brand-portal/stock" className="mt-5">
          {owner.isImpersonating && <input type="hidden" name="brand" value={owner.brandSlug} />}
          {activeLevel !== "all" && <input type="hidden" name="level" value={activeLevel} />}
          {params.product && <input type="hidden" name="product" value={params.product} />}
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative order-[1] min-w-0 lg:w-[320px] lg:flex-none"><span className="sr-only">Search inventory</span><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2948a]" /><input name="q" defaultValue={params.q ?? ""} autoComplete="off" placeholder="Product, color, size or SKU…" className={`${filterControl} w-full pl-10`} /></label>
            <nav aria-label="Inventory health" className="order-[2] flex h-10 min-w-0 overflow-x-auto rounded-xl border border-[#e7ddd5] bg-white">
              {levels.map((level) => {
                const active = activeLevel === level.key;
                return <Link key={level.key} href={filterHref({ level: level.key === "all" ? undefined : level.key, view: undefined })} aria-current={active ? "page" : undefined} className={`inline-flex h-full flex-none items-center gap-1.5 border-r border-[#eee7e1] px-3 text-[10.5px] font-bold transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 ${active ? "bg-[#f6e5e3] text-[#A94442]" : "text-[#6f635a] hover:bg-white hover:text-[#A94442]"}`}><span className={`h-1.5 w-1.5 rounded-full ${level.tone}`} />{level.label}<span className="tabular-nums text-[9.5px] opacity-70">{level.count}</span></Link>;
              })}
            </nav>
            {activeFilterCount > 0 && <Link href={filterHref({ q: undefined, level: undefined, sort: undefined, product: undefined, view: undefined })} className="order-[5] inline-flex h-10 items-center px-2 text-[10.5px] font-bold text-[#8d8076] hover:text-[#C85956]">Clear</Link>}
          </div>
        </AutoSubmitForm>
      </>}

      <div className="mt-4">
        {view === "inventory" && !variants.length ? <DashboardEmptyState title="No matching inventory" description={activeFilterCount ? "Try another stock level or clear the current search." : "Product variants will appear here after catalog setup."} /> : <InventoryManager variants={variants} returnVariants={returnVariants} activityVariants={activityLabelVariants} history={history} brandSlug={owner.brandSlug} isMahalyPartner={owner.isMahalyPartner} accessLevel={owner.accessLevel} readOnly={owner.isImpersonating} view={view} totalMatching={summary?.matchingResultCount} />}
      </div>
      {view === "inventory" && (previousHref || nextHref) && <nav aria-label="Inventory pages" className="mt-4 flex items-center justify-between rounded-2xl border border-[#eadfd7] bg-white px-4 py-3">
        <p className="text-[10.5px] text-[#8d8076]"><strong className="tabular-nums text-[#51473f]">{variants.length}</strong> {variants.length === 1 ? "variant" : "variants"} shown of <strong className="tabular-nums text-[#51473f]">{summary?.matchingResultCount ?? variants.length}</strong> matching, grouped by product</p>
        <div className="flex items-center gap-2">
          {previousHref ? <Link href={previousHref} className="inline-flex h-9 items-center rounded-xl border border-[#e4d9d1] px-3 text-[10.5px] font-bold text-[#5d5148] hover:border-[#C85956]/30 hover:text-[#C85956]">Previous</Link> : <span className="inline-flex h-9 items-center px-3 text-[10.5px] font-bold text-[#b3a69d]">Previous</span>}
          {nextHref ? <Link href={nextHref} className="inline-flex h-9 items-center rounded-xl bg-[#242424] px-3 text-[10.5px] font-bold text-white hover:bg-[#3a332e]">Next</Link> : <span className="inline-flex h-9 items-center px-3 text-[10.5px] font-bold text-[#b3a69d]">Next</span>}
        </div>
      </nav>}
    </div>
  );
}
