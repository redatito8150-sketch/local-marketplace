import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getInventoryHistoryForBrand, getVariantsForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import { inventoryRiskScore } from "@/lib/inventory/brandInventoryInsights";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import { DashboardEmptyState, DashboardPageHeader } from "@/components/dashboard/DashboardUI";
import InventoryManager from "@/components/brand-portal/InventoryManager";

type StockParams = { brand?: string; q?: string; level?: string; sort?: string; product?: string; view?: string; page?: string };
type StockLevel = "all" | "healthy" | "low" | "out";
const INVENTORY_PAGE_SIZE = 24;

const filterControl = "h-11 min-w-0 rounded-xl border border-[#e7ddd5] bg-white px-3 text-[12.5px] text-[#51473f] outline-none transition-colors focus-visible:border-[#C85956]/50 focus-visible:ring-4 focus-visible:ring-[#C85956]/8";

export default async function BrandPortalStockPage(props: { searchParams: Promise<StockParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandSlug) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />;
  }

  const [allVariants, history] = await Promise.all([
    getVariantsForBrand(owner.brandSlug, owner.isImpersonating),
    getInventoryHistoryForBrand(owner.brandId!, owner.isImpersonating),
  ]);
  const query = params.q?.trim().toLocaleLowerCase();
  const activeLevel = (["healthy", "low", "out"].includes(params.level ?? "") ? params.level : "all") as StockLevel;
  const view = params.view === "activity" ? "activity" : "inventory";
  const activeSort = params.sort ?? "risk";
  const variants = allVariants.filter((variant) => {
    if (query && !`${variant.productName} ${variant.color ?? ""} ${variant.size ?? ""} ${variant.sku}`.toLocaleLowerCase().includes(query)) return false;
    if (activeLevel === "healthy" && variant.stockStatus !== "in_stock") return false;
    if (activeLevel === "low" && variant.stockStatus !== "low_stock") return false;
    if (activeLevel === "out" && variant.stockStatus !== "out_of_stock") return false;
    if (params.product && variant.productId !== params.product) return false;
    return true;
  });
  variants.sort((a, b) => {
    if (activeSort === "stock-asc") return a.quantity - b.quantity;
    if (activeSort === "stock-desc") return b.quantity - a.quantity;
    if (activeSort === "risk") return inventoryRiskScore(a) - inventoryRiskScore(b);
    if (activeSort === "sales") return b.soldLast30Days - a.soldLast30Days;
    return a.productName.localeCompare(b.productName) || a.optionSummary.localeCompare(b.optionSummary);
  });
  const pageCount = Math.max(1, Math.ceil(variants.length / INVENTORY_PAGE_SIZE));
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const currentPage = Math.min(requestedPage, pageCount);
  const visibleVariants = variants.slice((currentPage - 1) * INVENTORY_PAGE_SIZE, currentPage * INVENTORY_PAGE_SIZE);

  const counts = {
    all: allVariants.length,
    healthy: allVariants.filter((variant) => variant.stockStatus === "in_stock").length,
    low: allVariants.filter((variant) => variant.stockStatus === "low_stock").length,
    out: allVariants.filter((variant) => variant.stockStatus === "out_of_stock").length,
  };
  const totalUnits = allVariants.reduce((sum, variant) => sum + variant.quantity, 0);
  const activeFilterCount = [params.q, activeLevel !== "all" ? activeLevel : undefined, params.sort, params.product].filter(Boolean).length;

  const href = (changes: Partial<StockParams>) => {
    const next = new URLSearchParams();
    if (owner.isImpersonating) next.set("brand", owner.brandSlug!);
    if (params.q) next.set("q", params.q);
    if (activeLevel !== "all") next.set("level", activeLevel);
    if (params.sort) next.set("sort", params.sort);
    if (params.product) next.set("product", params.product);
    if (params.page && params.page !== "1") next.set("page", params.page);
    if (view === "activity") next.set("view", "activity");
    for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
    return `/brand-portal/stock${next.size ? `?${next}` : ""}`;
  };
  const viewHref = (nextView: "inventory" | "activity") => {
    const next = new URLSearchParams();
    if (owner.isImpersonating) next.set("brand", owner.brandSlug!);
    if (nextView === "activity") next.set("view", "activity");
    return `/brand-portal/stock${next.size ? `?${next}` : ""}`;
  };

  const levels: Array<{ key: StockLevel; label: string; count: number; note: string; tone: string }> = [
    { key: "all", label: "All variants", count: counts.all, note: owner.isMahalyPartner ? `${totalUnits} units at Zakhnook` : `${totalUnits} units available`, tone: "bg-[#C85956]" },
    { key: "healthy", label: "Healthy", count: counts.healthy, note: "Above alert level", tone: "bg-emerald-500" },
    { key: "low", label: "Low stock", count: counts.low, note: "Plan a restock", tone: "bg-amber-500" },
    { key: "out", label: "Out of stock", count: counts.out, note: "Unavailable to shoppers", tone: "bg-red-500" },
  ];

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader
        eyebrow={owner.isMahalyPartner ? "Zakhnook fulfilled" : "Brand fulfilled"}
        title="Inventory"
        description={owner.isMahalyPartner
          ? "Track the stock physically available at Zakhnook. New units become sellable only after a shipment is received."
          : "Manage the stock you fulfil directly, catch risks early, and keep every variant accurate."}
      />

      <nav aria-label="Inventory views" className="mt-6 flex w-fit items-center gap-1 rounded-xl bg-[#eee7e1] p-1">
        <Link href={viewHref("inventory")} aria-current={view === "inventory" ? "page" : undefined} className={`rounded-lg px-4 py-2 text-[12px] font-bold transition-colors ${view === "inventory" ? "bg-white text-[#242424] shadow-[0_1px_4px_rgba(72,50,36,.09)]" : "text-[#776a61] hover:text-[#242424]"}`}>Inventory</Link>
        <Link href={viewHref("activity")} aria-current={view === "activity" ? "page" : undefined} className={`rounded-lg px-4 py-2 text-[12px] font-bold transition-colors ${view === "activity" ? "bg-white text-[#242424] shadow-[0_1px_4px_rgba(72,50,36,.09)]" : "text-[#776a61] hover:text-[#242424]"}`}>Activity <span className="ml-1 text-[10px] text-[#9a8c82]">{history.length}</span></Link>
      </nav>

      {view === "inventory" && <>
        <section aria-label="Inventory health" className="mt-5 overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white shadow-[0_10px_32px_rgba(72,50,36,.04)]">
          <div className="grid grid-cols-2 xl:grid-cols-4">
            {levels.map((level) => {
              const active = activeLevel === level.key;
              return <Link key={level.key} href={href({ level: level.key === "all" ? undefined : level.key, view: undefined, page: undefined })} aria-current={active ? "page" : undefined} className={`group relative min-h-[104px] border-b border-r border-[#eee7e1] px-4 py-4 transition-colors [&:nth-child(2n)]:border-r-0 [&:nth-child(n+3)]:border-b-0 xl:border-b-0 xl:px-5 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0 ${active ? "bg-[#fff8f6]" : "hover:bg-[#fcfaf8]"}`}>
                <span className={`absolute inset-y-4 left-0 w-[3px] rounded-r-full ${level.tone} ${active ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-40"}`} />
                <div className="flex items-start justify-between gap-4"><div><p className={`text-[10.5px] font-bold uppercase tracking-[0.1em] ${active ? "text-[#C85956]" : "text-[#8d8076]"}`}>{level.label}</p><p className="mt-1 text-[25px] font-extrabold tabular-nums tracking-[-0.04em] text-[#242424]">{level.count}</p></div><span className={`mt-1 h-2.5 w-2.5 rounded-full ${level.tone}`} /></div>
                <p className="mt-1 text-[10.5px] text-[#91837a]">{level.note}</p>
              </Link>;
            })}
          </div>
        </section>

        <form action="/brand-portal/stock" className="mt-4 rounded-[18px] border border-[#eadfd7] bg-white p-4">
          {owner.isImpersonating && <input type="hidden" name="brand" value={owner.brandSlug} />}
          {activeLevel !== "all" && <input type="hidden" name="level" value={activeLevel} />}
          {params.product && <input type="hidden" name="product" value={params.product} />}
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_190px_auto] lg:items-end">
            <label className="min-w-0"><span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">Search inventory</span><span className="relative mt-1.5 block"><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2948a]" /><input name="q" defaultValue={params.q ?? ""} autoComplete="off" placeholder="Product, color, size or SKU…" className={`${filterControl} w-full pl-10`} /></span></label>
            <label><span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">Sort by</span><select name="sort" defaultValue={activeSort} className={`${filterControl} mt-1.5 w-full`}><option value="risk">Running out soon</option><option value="sales">Best selling</option><option value="">Product name</option><option value="stock-asc">Lowest stock</option><option value="stock-desc">Highest stock</option></select></label>
            <div className="flex gap-2"><button type="submit" className="h-11 rounded-xl bg-[#C85956] px-5 text-[12px] font-bold text-white transition-colors hover:bg-[#b84e4b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/20">Apply</button>{activeFilterCount > 0 && <Link href={href({ q: undefined, level: undefined, sort: undefined, product: undefined, view: undefined, page: undefined })} className="inline-flex h-11 items-center px-2 text-[11px] font-bold text-[#8d8076] hover:text-[#C85956]">Clear</Link>}</div>
          </div>
        </form>
      </>}

      <div className="mt-4">
        {view === "inventory" && !variants.length ? <DashboardEmptyState title="No matching inventory" description={activeFilterCount ? "Try another stock level or clear the current search." : "Product variants will appear here after catalog setup."} /> : <InventoryManager variants={view === "inventory" ? visibleVariants : variants} allVariants={allVariants} history={history} brandSlug={owner.brandSlug} isMahalyPartner={owner.isMahalyPartner} readOnly={owner.isImpersonating} view={view} totalMatching={variants.length} />}
      </div>
      {view === "inventory" && pageCount > 1 && <nav aria-label="Inventory pages" className="mt-4 flex items-center justify-between rounded-2xl border border-[#eadfd7] bg-white px-4 py-3">
        <p className="text-[10.5px] text-[#8d8076]">Showing <strong className="tabular-nums text-[#51473f]">{(currentPage - 1) * INVENTORY_PAGE_SIZE + 1}–{Math.min(currentPage * INVENTORY_PAGE_SIZE, variants.length)}</strong> of {variants.length} variants</p>
        <div className="flex items-center gap-2">
          {currentPage > 1 ? <Link href={href({ page: currentPage === 2 ? undefined : String(currentPage - 1) })} className="inline-flex h-9 items-center rounded-xl border border-[#e4d9d1] px-3 text-[10.5px] font-bold text-[#5d5148] hover:border-[#C85956]/30 hover:text-[#C85956]">Previous</Link> : <span className="inline-flex h-9 items-center px-3 text-[10.5px] font-bold text-[#b3a69d]">Previous</span>}
          <span className="min-w-16 text-center text-[10.5px] font-bold tabular-nums text-[#51473f]">{currentPage} / {pageCount}</span>
          {currentPage < pageCount ? <Link href={href({ page: String(currentPage + 1) })} className="inline-flex h-9 items-center rounded-xl bg-[#242424] px-3 text-[10.5px] font-bold text-white hover:bg-[#3a332e]">Next</Link> : <span className="inline-flex h-9 items-center px-3 text-[10.5px] font-bold text-[#b3a69d]">Next</span>}
        </div>
      </nav>}
    </div>
  );
}
