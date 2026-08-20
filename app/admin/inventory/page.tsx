import Image from "next/image";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, Boxes, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, FileStack, List, MapPin, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { DashboardEmptyState, DashboardPageHeader } from "@/components/dashboard/DashboardUI";
import AutoSubmitForm from "@/components/dashboard/AutoSubmitForm";
import SortableTableHeader, { tableSortHref } from "@/components/dashboard/SortableTableHeader";
import {
  getInventoryBrandDetailForAdmin,
  getInventoryBrandSummariesForAdmin,
  getInventoryMovementsForAdmin,
  getInventoryProductsForAdmin,
  type AdminInventoryBrandDetail,
  type AdminInventoryBrandSummary,
  type AdminInventoryProductWithBrand,
} from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";
import { CONTROL, StockBadge, VariantIdentity, formatCount, titleCase } from "@/components/admin/inventory/shared";
import ColorSwatch from "@/components/admin/ColorSwatch";
import { compareSizeOrderables } from "@/lib/inventory/sizeOrder";
import {
  INVENTORY_MOVEMENT_GROUPS,
  INVENTORY_MOVEMENT_OPTIONS,
  INVENTORY_SOURCE_OPTIONS,
  inventoryLocationLabel,
  inventoryMovementLabel,
  inventorySourceLabel,
  movementTone,
} from "@/lib/inventory/movementPresentation";

const PAGE_SIZE = 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type InventoryView = "catalog" | "activity";
type Params = {
  view?: string;
  q?: string;
  brand?: string;
  fulfillment?: string;
  issues?: string;
  source?: string;
  movement?: string;
  from?: string;
  to?: string;
  productId?: string;
  variantId?: string;
  stock?: string;
  status?: string;
  page?: string;
  mode?: string;
  sort?: string;
};
type MovementResult = Awaited<ReturnType<typeof getInventoryMovementsForAdmin>>;
type MovementRow = MovementResult["rows"][number];
type ActivityMode = "movements" | "documents";

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view: InventoryView = params.view === "activity" ? "activity" : "catalog";
  const summaries = await getInventoryBrandSummariesForAdmin();

  return (
    <div>
      {view === "catalog" ? <DashboardPageHeader title="Inventory" description="Monitor stock across every brand, product, color and size from one place." /> : null}
      {view === "activity" ? (
        <ActivityWorkspaceLoader summaries={summaries} params={params} />
      ) : (
        <CatalogWorkspaceLoader summaries={summaries} params={params} />
      )}
    </div>
  );
}

async function CatalogWorkspaceLoader({ summaries, params }: { summaries: AdminInventoryBrandSummary[]; params: Params }) {
  const products = await getInventoryProductsForAdmin();
  return <AllProductsCatalog products={products} brands={summaries} params={params} />;
}

async function ActivityWorkspaceLoader({ summaries, params }: { summaries: AdminInventoryBrandSummary[]; params: Params }) {
  const selectedBrand = params.brand ? summaries.find((brand) => brand.slug === params.brand) ?? null : null;
  const detail = selectedBrand ? await getInventoryBrandDetailForAdmin(selectedBrand.slug) : null;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const source = INVENTORY_SOURCE_OPTIONS.some(([key]) => key === params.source) ? params.source : undefined;
  const movementType = INVENTORY_MOVEMENT_OPTIONS.some(([key]) => key === params.movement) ? params.movement : undefined;
  const from = params.from && DATE_PATTERN.test(params.from) ? params.from : undefined;
  const to = params.to && DATE_PATTERN.test(params.to) ? params.to : undefined;
  const q = params.q?.trim() || undefined;
  const selectedProduct = detail?.products.find((product) => product.id === params.productId);
  const selectedVariant = detail?.products.flatMap((product) => product.variants).find((variant) => variant.id === params.variantId);
  const movementResult = await getInventoryMovementsForAdmin({
    brand: selectedBrand?.name,
    q,
    productId: selectedProduct?.id,
    variantId: selectedVariant?.id,
    source,
    movementType,
    from,
    to,
    page,
    limit: PAGE_SIZE,
  });
  const mode: ActivityMode = params.mode === "documents" ? "documents" : "movements";
  return <ActivityWorkspace summaries={summaries} detail={detail} selectedBrand={selectedBrand} params={params} result={movementResult} source={source} movementType={movementType} from={from} to={to} page={page} mode={mode} />;
}

function AllProductsCatalog({ products, brands, params }: { products: AdminInventoryProductWithBrand[]; brands: AdminInventoryBrandSummary[]; params: Params }) {
  const term = (params.q ?? "").trim().toLocaleLowerCase("en-US");
  const brandFilter = params.brand ?? "";
  const fulfillment = params.fulfillment === "partner" || params.fulfillment === "brand" ? params.fulfillment : "";
  const issuesOnly = params.issues === "1";
  const stock = params.stock === "healthy" || params.stock === "low_stock" || params.stock === "out_of_stock" ? params.stock : "";
  const status = params.status === "draft" || params.status === "published" || params.status === "paused" ? params.status : "";

  const filtered = products.filter((product) => {
    if (brandFilter && product.brandSlug !== brandFilter) return false;
    if (fulfillment === "partner" && product.fulfillmentMode !== "zakhnook_fulfilled") return false;
    if (fulfillment === "brand" && product.fulfillmentMode !== "brand_fulfilled") return false;
    if (issuesOnly && product.issueCount === 0) return false;
    if (status && product.status !== status) return false;
    if (stock === "healthy" && !product.variants.some((variant) => variant.stockStatus === "in_stock")) return false;
    if (stock && stock !== "healthy" && !product.variants.some((variant) => variant.stockStatus === stock)) return false;
    const searchable = [product.brandName, product.name, product.status, ...product.variants.flatMap((variant) => [variant.sku, variant.label, variant.color ?? "", variant.size ?? ""])].join(" ").toLocaleLowerCase("en-US");
    if (term && !searchable.includes(term)) return false;
    return true;
  });

  return (
    <section>
      <CatalogFilters products={products} brands={brands} query={params.q ?? ""} brand={brandFilter} fulfillment={fulfillment} issuesOnly={issuesOnly} stock={stock} status={status} />
      {filtered.length ? (
        <div className="space-y-3">
          {filtered.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      ) : (
        <div className="rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
          <DashboardEmptyState title="No matching products" description="Clear the filters or search for another brand, product, color, size or SKU." />
        </div>
      )}
    </section>
  );
}

type ColorGroup = { key: string; label: string; variants: AdminInventoryProductWithBrand["variants"] };

function groupProductColors(product: AdminInventoryProductWithBrand): ColorGroup[] {
  const groups = new Map<string, ColorGroup>();
  for (const variant of product.variants) {
    const label = variant.color?.trim() || "Default";
    const key = label.toLocaleLowerCase("en-US");
    const group = groups.get(key) ?? { key, label, variants: [] };
    group.variants.push(variant);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    variants: [...group.variants].sort((first, second) => compareSizeOrderables(
      { id: first.id, label: first.size ?? "One size", sortOrder: first.sizeSortOrder, brandId: first.sizeBrandId },
      { id: second.id, label: second.size ?? "One size", sortOrder: second.sizeSortOrder, brandId: second.sizeBrandId }
    )),
  }));
}

function ProductCard({ product }: { product: AdminInventoryProductWithBrand }) {
  const colors = groupProductColors(product);
  return (
    <details className="group overflow-hidden rounded-[22px] border border-[#e8e6e3] bg-white shadow-[0_10px_30px_rgba(72,50,36,.035)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 bg-white px-4 py-3.5 outline-none transition-colors hover:bg-[#fafafa] focus-visible:bg-[#f7f7f7] [&::-webkit-details-marker]:hidden">
        <span className="relative h-14 w-12 flex-none overflow-hidden rounded-xl bg-[#f4f2f0]">{product.image ? <Image src={product.image} alt="" fill sizes="48px" className="object-cover" /> : <Boxes className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}</span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#B94F4C]">
            <span className="relative flex h-[18px] w-[18px] flex-none items-center justify-center overflow-hidden rounded-md bg-[#f7f4f2] text-[8px] font-extrabold">
              {product.brandLogoImage ? <Image src={product.brandLogoImage} alt="" fill sizes="18px" className="object-contain p-0.5" /> : product.brandName.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{product.brandName}</span>
          </p>
          <h3 className="truncate text-[14px] font-extrabold text-[#302924]">{product.name}</h3>
          <p className="mt-1 text-[10.5px] text-[#756960]">{titleCase(product.status)} · {formatCount(colors.length)} {colors.length === 1 ? "color" : "colors"} · {formatCount(product.variants.length)} {product.variants.length === 1 ? "size" : "sizes"}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[14px] font-extrabold tabular-nums text-[#302924]">{formatCount(product.totalUnits)}</p>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">available units</p>
          {product.issueCount ? <p className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[9.5px] font-bold text-amber-800">{formatCount(product.issueCount)} need attention</p> : null}
        </div>
        <ChevronRight aria-hidden="true" className="ml-1 h-4 w-4 flex-none text-[#a99b91] transition-transform group-open:rotate-90 group-open:text-[#C85956]" />
      </summary>
      <div className="border-t border-[#eeece9] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eeece9] bg-white px-4 py-2">
          <p className="text-[10px] font-semibold text-[#756960]">Open a color to inspect its sizes and stock.</p>
          <div className="flex items-center gap-3">
            <Link href={`/admin/inventory?view=activity&brand=${encodeURIComponent(product.brandSlug)}&productId=${encodeURIComponent(product.id)}`} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#756960] hover:text-[#C85956]"><Activity className="h-3 w-3" />All movements</Link>
            <Link href={`/admin/products/${product.id}/edit`} className="text-[10.5px] font-bold text-[#756960] hover:text-[#C85956]">Edit product</Link>
          </div>
        </div>
        {colors.length ? <div className="space-y-2 p-2.5 sm:p-3">{colors.map((color) => <ColorInventoryGroup key={color.key} product={product} color={color} />)}</div> : <DashboardEmptyState title="No variants" description="This product does not have an active inventory variant yet." />}
      </div>
    </details>
  );
}

function ColorInventoryGroup({ product, color }: { product: AdminInventoryProductWithBrand; color: ColorGroup }) {
  const total = color.variants.reduce((sum, variant) => sum + variant.quantity, 0);
  const issues = color.variants.filter((variant) => variant.stockStatus !== "in_stock").length;
  const image = color.variants[0]?.image ?? product.image;
  return (
    <details className="group/color overflow-hidden rounded-2xl border border-[#e8e6e3] bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 outline-none transition-colors hover:bg-[#fafafa] focus-visible:bg-[#f7f7f7] [&::-webkit-details-marker]:hidden sm:px-4">
        <ChevronRight className="h-3.5 w-3.5 flex-none text-[#9f9187] transition-transform group-open/color:rotate-90 group-open/color:text-[#C85956]" />
        <span className="relative h-12 w-10 flex-none overflow-hidden rounded-xl bg-[#f4f2f0]">{image ? <Image src={image} alt={`${product.name} in ${color.label}`} fill sizes="40px" className="object-cover" /> : <Boxes className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}</span>
        <span className="min-w-0"><span className="block truncate text-[12.5px] font-extrabold text-[#403730]">{color.label}</span><span className="mt-1 block text-[10px] text-[#756960]">{formatCount(color.variants.length)} {color.variants.length === 1 ? "size" : "sizes"}</span></span>
        <span className="ml-auto text-right"><span className="block text-[13px] font-extrabold tabular-nums text-[#302924]">{formatCount(total)}</span><span className="block text-[9px] font-semibold text-[#756960]">available</span></span>
        {issues ? <span className="hidden rounded-lg bg-amber-50 px-2 py-1 text-[8.5px] font-bold text-amber-800 sm:inline-flex">{formatCount(issues)} need attention</span> : <span className="hidden sm:inline-flex"><StockBadge status="in_stock" /></span>}
      </summary>
      <div className="border-t border-[#e8e6e3] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] table-fixed text-left">
            <colgroup>
              <col style={{ width: "34%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "23%" }} />
            </colgroup>
            <thead className="border-b border-[#eeece9] text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">
              <tr><th className="px-4 py-2">Size / SKU</th><th className="px-3 py-2 text-center">Available</th><th className="px-3 py-2 text-center">Alert at</th><th className="px-3 py-2 text-center">Selling</th><th className="px-3 py-2 text-center">Status / movements</th></tr>
            </thead>
            <tbody className="divide-y divide-[#eeece9]">{color.variants.map((variant) => <VariantSizeRow key={variant.id} variant={variant} product={product} />)}</tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function VariantSizeRow({ variant, product }: { variant: AdminInventoryProductWithBrand["variants"][number]; product: AdminInventoryProductWithBrand }) {
  const movementsHref = `/admin/inventory?view=activity&brand=${encodeURIComponent(product.brandSlug)}&productId=${encodeURIComponent(product.id)}&variantId=${encodeURIComponent(variant.id)}`;
  return (
    <tr>
      <td className="px-4 py-3"><div className="min-w-0"><div className="flex items-center gap-1.5"><span title={variant.color ?? "Default color"}><ColorSwatch swatchType={variant.swatchType} primaryColor={variant.primaryColor} secondaryColor={variant.secondaryColor} size={12} /></span><p className="text-[11.5px] font-bold text-[#51473f]">{variant.size || "One size"}</p></div><code className="mt-1 block truncate text-[9.5px] text-[#756960]">{variant.sku}</code></div></td>
      <td className="px-3 py-3 text-center text-[12px] font-extrabold tabular-nums text-[#403730]">{formatCount(variant.quantity)}</td>
      <td className="px-3 py-3 text-center text-[10.5px] tabular-nums text-[#756960]">{formatCount(variant.threshold)}</td>
      <td className="px-3 py-3 text-center text-[10.5px] font-semibold text-[#756960]">{titleCase(variant.sellingStatus)}</td>
      <td className="px-3 py-3"><div className="flex items-center justify-center gap-2"><StockBadge status={variant.stockStatus} /><Link href={movementsHref} aria-label={`View movement history for ${variant.sku}`} className="inline-flex items-center gap-1 rounded-lg border border-[#e8e6e3] bg-white px-2.5 py-1.5 text-[9.5px] font-bold text-[#51473f] transition-colors hover:bg-[#fafafa] hover:text-[#C85956]"><Activity className="h-3 w-3" />Movements</Link></div></td>
    </tr>
  );
}

function CatalogFilters({ products, brands, query, brand, fulfillment, issuesOnly, stock, status }: { products: AdminInventoryProductWithBrand[]; brands: AdminInventoryBrandSummary[]; query: string; brand: string; fulfillment: string; issuesOnly: boolean; stock: string; status: string }) {
  const active = Boolean(query || brand || fulfillment || issuesOnly || stock || status);
  const advancedCount = [brand, fulfillment, status, issuesOnly ? "1" : ""].filter(Boolean).length;
  const stockCounts = products.flatMap((product) => product.variants).reduce((counts, variant) => {
    counts.all += 1;
    counts[variant.stockStatus] += 1;
    return counts;
  }, { all: 0, in_stock: 0, low_stock: 0, out_of_stock: 0 });
  const quickFilters = [
    ["", "All variants", stockCounts.all, "bg-[#C85956]"],
    ["healthy", "Healthy", stockCounts.in_stock, "bg-emerald-500"],
    ["low_stock", "Low stock", stockCounts.low_stock, "bg-amber-400"],
    ["out_of_stock", "Out of stock", stockCounts.out_of_stock, "bg-red-500"],
  ] as const;
  const stockHref = (value: string) => {
    const search = new URLSearchParams();
    search.set("view", "catalog");
    if (query) search.set("q", query);
    if (brand) search.set("brand", brand);
    if (fulfillment) search.set("fulfillment", fulfillment);
    if (issuesOnly) search.set("issues", "1");
    if (status) search.set("status", status);
    if (value) search.set("stock", value);
    return `/admin/inventory?${search}`;
  };
  return (
    <AutoSubmitForm action="/admin/inventory" className="relative mb-3 mt-5 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <input type="hidden" name="view" value="catalog" />
      <label className="relative order-[1] min-w-0 sm:w-[320px] sm:flex-none">
        <span className="sr-only">Search inventory</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9b8d83]" />
        <input name="q" defaultValue={query} placeholder="Brand, product, color, size or SKU" className={`${CONTROL} w-full pl-9`} />
      </label>
      <nav aria-label="Stock filters" className="order-[2] flex h-11 min-w-0 max-w-full overflow-x-auto rounded-xl border border-[#e5ddd5] bg-[#fcfaf8]">
        {quickFilters.map(([value, label, count, tone]) => {
          const selected = stock === value;
          return <Link key={value || "all"} scroll={false} href={stockHref(value)} aria-current={selected ? "page" : undefined} className={`inline-flex h-full flex-none items-center gap-1.5 border-r border-[#e9e1da] px-3 text-[10px] font-bold transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e7e4de] ${selected ? "bg-[#f6e5e3] text-[#A94442]" : "text-[#6f635a] hover:bg-white"}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone}`} />{label}<span className="tabular-nums text-[#94867c]">{formatCount(count)}</span></Link>;
        })}
      </nav>
      <div className="order-[6] flex flex-wrap items-center gap-2">
        <details className="group/filters order-[6]">
          <summary aria-label="More inventory filters" data-dashboard-filter-control="true" className="relative flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-[#e5ddd5] bg-[#fcfaf8] text-[#75685f] outline-none transition-colors hover:bg-[#f7f1ec] hover:text-[#C85956] [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
            {advancedCount ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#C85956]" /> : null}
          </summary>
          <div className="absolute left-0 top-[calc(100%+8px)] z-30 grid w-full max-w-[620px] gap-3 rounded-2xl border border-[#e7ddd5] bg-white p-4 shadow-[0_18px_48px_rgba(72,50,36,.16)] sm:grid-cols-2">
            <label><span className="mb-1.5 block text-[10px] font-bold text-[#81746a]">Brand</span><select name="brand" defaultValue={brand} className={`${CONTROL} w-full`}><option value="">All brands</option>{brands.map((b) => <option key={b.id} value={b.slug}>{b.name}</option>)}</select></label>
            <label><span className="mb-1.5 block text-[10px] font-bold text-[#81746a]">Fulfillment</span><select name="fulfillment" defaultValue={fulfillment} className={`${CONTROL} w-full`}><option value="">All fulfillment modes</option><option value="partner">Partner (Zakhnook stock)</option><option value="brand">Brand-fulfilled</option></select></label>
            <label><span className="mb-1.5 block text-[10px] font-bold text-[#81746a]">Product status</span><select name="status" defaultValue={status} className={`${CONTROL} w-full`}><option value="">All product states</option><option value="published">Published</option><option value="paused">Paused</option><option value="draft">Draft</option></select></label>
            <label className={`${CONTROL} mt-[22px] flex cursor-pointer items-center gap-2`}><input type="checkbox" name="issues" value="1" defaultChecked={issuesOnly} className="h-3.5 w-3.5 accent-[#C85956]" />Issues only</label>
          </div>
        </details>
        {active ? (
          <Link href="/admin/inventory?view=catalog" className="order-[5] px-1 text-[10px] font-bold text-[#75685f] hover:text-[#C85956]">
            Clear
          </Link>
        ) : null}
      </div>
    </AutoSubmitForm>
  );
}

function ActivityWorkspace({ summaries, detail, selectedBrand, params, result, source, movementType, from, to, page, mode }: { summaries: AdminInventoryBrandSummary[]; detail: AdminInventoryBrandDetail | null; selectedBrand: AdminInventoryBrandSummary | null; params: Params; result: MovementResult | null; source?: string; movementType?: string; from?: string; to?: string; page: number; mode: ActivityMode }) {
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));
  const clearHref = "/admin/inventory?view=activity";
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value && key !== "page") search.set(key, value);
    });
    search.set("view", "activity");
    if (target > 1) search.set("page", String(target));
    return `/admin/inventory?${search}`;
  };
  const modeHref = (target: ActivityMode) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value && key !== "page" && key !== "mode") search.set(key, value);
    });
    search.set("view", "activity");
    if (target === "documents") search.set("mode", "documents");
    return `/admin/inventory?${search}`;
  };
  const exportSearch = new URLSearchParams();
  for (const key of ["q", "brand", "productId", "variantId", "source", "movement", "from", "to"] as const) {
    const value = params[key];
    if (value) exportSearch.set(key, value);
  }
  const exportHref = `/api/admin/inventory/movements/export${exportSearch.size ? `?${exportSearch}` : ""}`;
  const selectedProductName = detail?.products.find((product) => product.id === params.productId)?.name;
  const selectedVariantSku = detail?.products.flatMap((product) => product.variants).find((variant) => variant.id === params.variantId)?.sku;
  const heading = selectedVariantSku ?? selectedProductName ?? (selectedBrand ? `${selectedBrand.name} movement ledger` : "Movement ledger");
  const rows = [...(result?.rows ?? [])].sort((first, second) => {
    const direction = params.sort?.endsWith("-desc") ? -1 : 1;
    if (params.sort?.startsWith("variant-")) return direction * first.variantSku.localeCompare(second.variantSku, undefined, { numeric: true });
    if (params.sort?.startsWith("balance-")) return direction * (first.newQuantity - second.newQuantity);
    if (params.sort?.startsWith("event-")) return direction * first.movementType.localeCompare(second.movementType);
    if (params.sort?.startsWith("source-")) return direction * first.source.localeCompare(second.source);
    if (params.sort?.startsWith("recorded-")) return direction * (Date.parse(first.createdAt) - Date.parse(second.createdAt));
    return Date.parse(second.createdAt) - Date.parse(first.createdAt);
  });
  return (
    <section className="mt-5">
      <MovementFilters summaries={summaries} detail={detail} selectedBrand={selectedBrand} params={params} source={source} movementType={movementType} from={from} to={to} clearHref={clearHref} />
      <div className="mt-4 overflow-hidden rounded-[20px] border border-[#ece4de] bg-white shadow-[0_16px_40px_rgba(72,50,36,.06)]">
        <header className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-extrabold text-[#302924]">{heading}</h2>
              <span className="rounded-full bg-[#f1ece7] px-2.5 py-1 text-[10px] font-extrabold tabular-nums text-[#655a52]">{formatCount(result?.total ?? 0)}</span>
            </div>
            <p className="mt-1 text-[11.5px] leading-5 text-[#756960]">Immutable stock history · newest first</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <nav aria-label="Movement presentation" className="inline-flex rounded-xl bg-[#f4f0ec] p-1">
              <Link scroll={false} href={modeHref("movements")} aria-current={mode === "movements" ? "page" : undefined} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[10.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 sm:px-3 sm:text-[11px] ${mode === "movements" ? "bg-white text-[#A94442] shadow-sm" : "text-[#665a52] hover:bg-white/70 hover:text-[#302924]"}`}>
                <List aria-hidden="true" className="h-3.5 w-3.5" />Movements
              </Link>
              <Link scroll={false} href={modeHref("documents")} aria-current={mode === "documents" ? "page" : undefined} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[10.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 sm:px-3 sm:text-[11px] ${mode === "documents" ? "bg-white text-[#A94442] shadow-sm" : "text-[#665a52] hover:bg-white/70 hover:text-[#302924]"}`}>
                <FileStack aria-hidden="true" className="h-3.5 w-3.5" />Documents
              </Link>
            </nav>
            <a aria-label="Export CSV" href={exportHref} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#f4f0ec] px-2.5 text-[10.5px] font-bold text-[#51473f] transition-colors hover:bg-[#efe5e3] hover:text-[#A94442] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 sm:px-3 sm:text-[11px]">
              <Download aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden sm:inline">Export&nbsp;</span>CSV
            </a>
          </div>
        </header>
        {rows.length ? (
          mode === "documents"
            ? <DocumentMovementGroups rows={rows} showBrand={!selectedBrand} />
            : <ActivityRows rows={rows} showBrand={!selectedBrand} params={params} />
        ) : <DashboardEmptyState title="No movements found" description="Adjust the filters or wait for the first inventory change." />}
      </div>
      {totalPages > 1 ? (
        <nav aria-label="Movement pages" className="mt-4 flex items-center justify-between rounded-[18px] border border-[#ece4de] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(72,50,36,.05)]">
          <span>
            {page > 1 ? (
              <Link scroll={false} href={pageHref(page - 1)} className="inline-flex h-9 items-center gap-1 rounded-xl bg-[#f4f0ec] px-3 text-[10.5px] font-bold text-[#51473f] hover:bg-[#ece5de] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">
                <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
                Previous
              </Link>
            ) : null}
          </span>
          <p className="text-[10.5px] text-[#8d8076]">
            {mode === "documents" ? "Movement page" : "Page"} <strong>{page}</strong> of <strong>{totalPages}</strong>
          </p>
          <span>
            {page < totalPages ? (
              <Link scroll={false} href={pageHref(page + 1)} className="inline-flex h-9 items-center gap-1 rounded-xl bg-[#C85956] px-3 text-[10.5px] font-bold text-white hover:bg-[#b64e4b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">
                Next
                <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
    </section>
  );
}

function MovementFilters({ summaries, detail, selectedBrand, params, source, movementType, from, to, clearHref }: { summaries: AdminInventoryBrandSummary[]; detail: AdminInventoryBrandDetail | null; selectedBrand: AdminInventoryBrandSummary | null; params: Params; source?: string; movementType?: string; from?: string; to?: string; clearHref: string }) {
  const active = Boolean(params.q || params.brand || params.productId || params.variantId || source || movementType || from || to);
  const advancedFilterCount = [params.brand, params.productId, params.variantId, source, movementType].filter(Boolean).length;
  const quickMovements = [
    ["", "All", "bg-[#C85956]"],
    ["receipt_posted", "Receipts", "bg-emerald-500"],
    ["order_placed", "Orders", "bg-amber-400"],
    ["warehouse_quantity_correction", "Corrections", "bg-red-500"],
  ] as const;
  const quickMovementHref = (target: string) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value && key !== "page" && key !== "movement") search.set(key, value);
    });
    search.set("view", "activity");
    if (target) search.set("movement", target);
    return `/admin/inventory?${search}`;
  };
  return (
    <AutoSubmitForm action="/admin/inventory" className="relative">
      <input type="hidden" name="view" value="activity" />
      {params.mode === "documents" ? <input type="hidden" name="mode" value="documents" /> : null}
      <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <label className="order-[1] min-w-0 flex-1 md:min-w-[260px] xl:max-w-[330px]">
          <span className="sr-only">Search movements</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9b8d83]" />
            <input autoComplete="off" spellCheck={false} name="q" defaultValue={params.q ?? ""} placeholder="Product, brand or SKU…" className="h-10 w-full min-w-0 rounded-xl border-0 bg-[#fbfaf8] px-3 pl-9 text-[12px] font-medium text-[#51473f] outline-none ring-1 ring-[#e9e1da] placeholder:text-[#93867c] focus-visible:ring-2 focus-visible:ring-[#C85956]/25" />
          </div>
        </label>
        <nav aria-label="Quick movement filters" className="order-[2] flex h-10 min-w-0 overflow-x-auto rounded-xl border border-[#e8dfd8] bg-[#fbfaf8]">
          {quickMovements.map(([value, label, tone]) => {
            const selected = (movementType ?? "") === value;
            return <Link key={value || "all"} scroll={false} href={quickMovementHref(value)} aria-current={selected ? "page" : undefined} className={`inline-flex h-full flex-none items-center gap-1.5 border-r border-[#ebe3dc] px-3 text-[10.5px] font-bold transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 ${selected ? "bg-[#f6e5e3] text-[#A94442]" : "text-[#6f635a] hover:bg-white hover:text-[#A94442]"}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone}`} />{label}</Link>;
          })}
        </nav>
        <details className="group/date relative order-[4] w-full md:w-auto">
          <summary aria-label="Choose date range" data-dashboard-filter-control="true" className="relative flex h-10 w-full cursor-pointer list-none items-center justify-center rounded-xl border border-[#e9e1da] bg-[#fbfaf8] text-[#776a61] outline-none transition-colors hover:bg-[#f6f1ed] hover:text-[#A94442] md:w-10 [&::-webkit-details-marker]:hidden">
            <CalendarDays aria-hidden="true" className="h-4 w-4" />
            {from || to ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#C85956]" /> : null}
          </summary>
          <div className="absolute left-0 top-[calc(100%+8px)] z-30 grid w-[min(92vw,390px)] gap-3 rounded-2xl border border-[#e7ddd5] bg-white p-4 shadow-[0_18px_48px_rgba(72,50,36,.14)] sm:grid-cols-2">
            <DateFilter label="From" name="from" value={from ?? ""} compact />
            <DateFilter label="To" name="to" value={to ?? ""} compact />
          </div>
        </details>
        <details className="group/filters relative order-[6] w-full md:w-auto">
          <summary aria-label="More movement filters" data-dashboard-filter-control="true" className="relative flex h-10 w-full cursor-pointer list-none items-center justify-center rounded-xl border border-[#e9e1da] bg-[#fbfaf8] text-[#6f635a] outline-none transition-colors hover:bg-[#f6f1ed] hover:text-[#A94442] md:w-10 [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
            {advancedFilterCount > 0 ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#C85956]" /> : null}
          </summary>
          <div className="absolute right-0 top-[calc(100%+8px)] z-30 grid w-[min(92vw,640px)] min-w-0 gap-3 rounded-2xl border border-[#e7ddd5] bg-white p-4 shadow-[0_18px_48px_rgba(72,50,36,.16)] sm:grid-cols-2">
            <Select label="Brand" name="brand" value={selectedBrand?.slug ?? ""}><option value="">All brands</option>{summaries.map((brand) => <option key={brand.id} value={brand.slug}>{brand.name}</option>)}</Select>
            {detail ? (
              <>
                <Select label="Product" name="productId" value={params.productId ?? ""}>
                  <option value="">All products in {detail.name}</option>
                  {detail.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </Select>
                <Select label="Variant" name="variantId" value={params.variantId ?? ""}>
                  <option value="">All variants</option>
                  {detail.products.filter((product) => !params.productId || product.id === params.productId).map((product) => (
                    <optgroup key={product.id} label={product.name}>
                      {product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.color || "Default"} / {variant.size || "One size"} / {variant.sku}</option>)}
                    </optgroup>
                  ))}
                </Select>
              </>
            ) : null}
            <Select label="Source" name="source" value={source ?? ""}>
              <option value="">All sources</option>
              {INVENTORY_SOURCE_OPTIONS.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
            <Select label="Movement" name="movement" value={movementType ?? ""}>
              <option value="">All movements</option>
              {INVENTORY_MOVEMENT_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </optgroup>
              ))}
            </Select>
          </div>
        </details>
        {active ? (
          <Link scroll={false} href={clearHref} className="order-[5] inline-flex h-10 items-center justify-center rounded-xl px-2.5 text-[10.5px] font-bold text-[#776b62] hover:bg-white/70 hover:text-[#A94442] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">
            Clear
          </Link>
        ) : null}
      </div>
    </AutoSubmitForm>
  );
}

function ActivityRows({ rows, showBrand, params }: { rows: MovementRow[]; showBrand: boolean; params: Params }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[920px] table-fixed text-left text-[11.5px]">
          <caption className="sr-only">Filtered inventory movements, newest first</caption>
          <colgroup>
            <col className="w-[27%]" />
            <col className="w-[23%]" />
            <col className="w-[24%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-[#e8dfd8] bg-[#f7f3ef] text-[10px] font-bold uppercase tracking-[0.08em] text-[#675b53]">
            <tr>
              <SortableTableHeader label="Variant" href={tableSortHref("/admin/inventory", params, "variant")} active={params.sort?.startsWith("variant-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} />
              <SortableTableHeader className="px-0" label="Balance & route" href={tableSortHref("/admin/inventory", params, "balance", "desc")} active={params.sort?.startsWith("balance-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} />
              <SortableTableHeader className="px-0" label="Event" href={tableSortHref("/admin/inventory", params, "event")} active={params.sort?.startsWith("event-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} />
              <SortableTableHeader className="px-0" label="Source" href={tableSortHref("/admin/inventory", params, "source")} active={params.sort?.startsWith("source-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} />
              <SortableTableHeader className="px-0 pr-5 text-right" label="Recorded" href={tableSortHref("/admin/inventory", params, "recorded", "desc")} active={!params.sort || params.sort.startsWith("recorded-")} direction={!params.sort || params.sort.endsWith("desc") ? "desc" : "asc"} />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0e9e3]">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-[#fcfaf8]">
                <td className={`border-l-[3px] px-5 py-4 ${movementAccent(row.quantityDelta)}`}>
                  <VariantIdentity image={row.variantImage} productName={row.productName} label={`${row.productName} · ${row.variantLabel}`} sku={row.variantSku} meta={showBrand ? row.brandName : undefined} />
                </td>
                <td className="pr-4"><MovementBalance row={row} /></td>
                <td className="max-w-[310px] pr-4"><MovementEvent row={row} /></td>
                <td className="pr-4"><MovementReference row={row} /></td>
                <td className="pr-5 text-right"><MovementRecorded row={row} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-[#eee7e1] md:hidden">
        {rows.map((row) => (
          <article key={row.id} aria-label={`${row.variantSku} movement`} className={`border-l-[3px] px-4 py-5 ${movementAccent(row.quantityDelta)}`}>
            <div className="flex items-start justify-between gap-3">
              <VariantIdentity image={row.variantImage} productName={row.productName} label={`${row.productName} · ${row.variantLabel}`} sku={row.variantSku} meta={showBrand ? row.brandName : undefined} />
              <MovementDelta row={row} />
            </div>
            <div className="mt-4 grid gap-4 rounded-xl bg-[#faf8f6] p-3 sm:grid-cols-2">
              <MovementBalance row={row} showDelta={false} />
              <MovementEvent row={row} />
            </div>
            <div className="mt-3 flex flex-col gap-3 border-t border-[#f0e9e3] pt-3 text-[10.5px] sm:flex-row sm:items-end sm:justify-between">
              <MovementReference row={row} />
              <MovementRecorded row={row} />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function movementAccent(delta: number): string {
  if (delta > 0) return "border-l-emerald-500";
  if (delta < 0) return "border-l-red-500";
  return "border-l-amber-500";
}

function MovementDelta({ row }: { row: MovementRow }) {
  const tone = movementTone(row.quantityDelta);
  const style = tone === "in" ? "bg-emerald-50 text-emerald-800" : tone === "out" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800";
  return <span className={`inline-flex min-w-9 flex-none justify-center rounded-full px-2 py-1 text-[11px] font-extrabold tabular-nums ${style}`}>{row.quantityDelta > 0 ? "+" : ""}{row.quantityDelta}</span>;
}

function MovementBalance({ row, showDelta = true }: { row: MovementRow; showDelta?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2" aria-label={`Stock changed from ${row.previousQuantity} to ${row.newQuantity}`}>
        <span className="text-[12px] font-semibold tabular-nums text-[#756960]">{row.previousQuantity}</span>
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-[#b1a49b]" />
        <strong className="text-[15px] font-extrabold tabular-nums text-[#302924]">{row.newQuantity}</strong>
        {showDelta ? <MovementDelta row={row} /> : null}
      </div>
      <MovementRoute row={row} />
    </div>
  );
}

function MovementRoute({ row }: { row: MovementRow }) {
  const fromLabel = inventoryLocationLabel(row.fromLocation);
  const toLabel = inventoryLocationLabel(row.toLocation);
  return (
    <div className="mt-2 min-w-0">
      {fromLabel || toLabel ? (
        <div className="flex min-w-0 items-center gap-1.5 text-[10.5px] font-semibold text-[#665a52]">
          <MapPin aria-hidden="true" className="h-3.5 w-3.5 flex-none text-[#b86a67]" />
          <span className="truncate">{fromLabel ?? "Balance"}</span><ArrowRight aria-hidden="true" className="h-3 w-3 flex-none text-[#a4978d]" /><span className="truncate">{toLabel ?? "Balance"}</span>
        </div>
      ) : <p className="text-[10.5px] font-semibold text-[#756960]">Sellable balance</p>}
      {row.quantityDelta === 0 ? <p className="mt-1 text-[9.5px] font-semibold text-amber-800">No sellable change</p> : null}
    </div>
  );
}

function MovementEvent({ row }: { row: MovementRow }) {
  const movementLabel = inventoryMovementLabel(row.movementType);
  const reason = conciseMovementReason(row, movementLabel);
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] font-extrabold leading-5 text-[#302924]">{movementLabel}</p>
      {reason ? <p className="mt-0.5 line-clamp-2 text-[10.5px] font-medium leading-4 text-[#665a52]">{reason}</p> : null}
      {row.note ? <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[#8b7d73]">{row.note}</p> : null}
      {row.hasTestOrLegacyNote ? <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-800"><AlertTriangle aria-hidden="true" className="h-3 w-3" />Test or legacy note</span> : null}
    </div>
  );
}

function conciseMovementReason(row: MovementRow, movementLabel: string): string | null {
  const normalize = (value: string) => value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
  const reason = row.reason.trim();
  const normalizedReason = normalize(reason);
  if (!normalizedReason) return null;

  const normalizedMovement = normalize(movementLabel);
  const normalizedReference = row.reference ? normalize(row.reference.label) : "";
  const movementRemainder = normalizedMovement && normalizedReason.includes(normalizedMovement)
    ? normalizedReason.replace(normalizedMovement, "").trim()
    : normalizedReason;
  const referenceRemainder = normalizedReference && normalizedReason.includes(normalizedReference)
    ? normalizedReason.replace(normalizedReference, "").trim()
    : normalizedReason;
  if (!movementRemainder || movementRemainder.split(" ").length <= 1) return null;
  if (referenceRemainder !== normalizedReason && referenceRemainder.split(" ").length <= 3) return null;
  return reason;
}

function MovementReference({ row }: { row: MovementRow }) {
  return (
    <div className="min-w-0 text-[10px] leading-4">
      {row.reference ? (
        <Link href={row.reference.href} className="inline-flex items-center gap-1 font-extrabold text-[#C85956] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">
          {row.reference.label}<ExternalLink aria-hidden="true" className="h-3 w-3" />
        </Link>
      ) : <span className="font-bold text-[#51473f]">{inventorySourceLabel(row.source)}</span>}
      {row.reference ? <p className="mt-1 text-[#756960]">{inventorySourceLabel(row.source)}</p> : null}
    </div>
  );
}

function MovementRecorded({ row }: { row: MovementRow }) {
  return (
    <div className="min-w-0 text-right">
      <p className="whitespace-nowrap text-[10.5px] font-medium tabular-nums text-[#665a52]">{formatDateTime(row.createdAt)}</p>
      <p className="mt-1.5 inline-flex max-w-full items-center justify-end gap-1 text-[10px] text-[#8b7d73]" title={row.actor?.email ?? undefined}>
        <UserRound aria-hidden="true" className="h-3 w-3 flex-none" /><span className="truncate">{row.actor ? `${row.actor.displayName} · ${row.actor.roleLabel}` : "System"}</span>
      </p>
    </div>
  );
}

type MovementGroup = {
  key: string;
  label: string;
  href: string | null;
  source: string;
  createdAt: string;
  actor: MovementRow["actor"];
  rows: MovementRow[];
  brandNames: string[];
  netChange: number;
  hasTestOrLegacyNote: boolean;
};

function groupMovements(rows: MovementRow[]): MovementGroup[] {
  const groups = new Map<string, MovementGroup>();
  for (const row of rows) {
    const current = groups.get(row.groupKey);
    if (current) {
      current.rows.push(row);
      current.netChange += row.quantityDelta;
      current.hasTestOrLegacyNote ||= row.hasTestOrLegacyNote;
      if (!current.brandNames.includes(row.brandName)) current.brandNames.push(row.brandName);
      continue;
    }
    groups.set(row.groupKey, {
      key: row.groupKey,
      label: row.reference?.label ?? (row.sourceOperationKey ? `${inventorySourceLabel(row.source)} batch` : inventoryMovementLabel(row.movementType)),
      href: row.reference?.href ?? null,
      source: row.source,
      createdAt: row.createdAt,
      actor: row.actor,
      rows: [row],
      brandNames: [row.brandName],
      netChange: row.quantityDelta,
      hasTestOrLegacyNote: row.hasTestOrLegacyNote,
    });
  }
  return [...groups.values()];
}

function DocumentMovementGroups({ rows, showBrand }: { rows: MovementRow[]; showBrand: boolean }) {
  const groups = groupMovements(rows);
  return (
    <div className="divide-y divide-[#f0e9e3]">
      {groups.map((group) => (
        <details key={group.key} className="group/document bg-white open:bg-[#fcfaf8]">
          <summary className={`grid cursor-pointer list-none gap-3 border-l-[3px] px-5 py-4 outline-none transition-colors hover:bg-[#fbf8f5] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 sm:grid-cols-[minmax(180px,1fr)_auto_auto] sm:items-center [&::-webkit-details-marker]:hidden ${movementAccent(group.netChange)}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <FileStack aria-hidden="true" className="h-4 w-4 text-[#C85956]" />
                <span className="truncate text-[12px] font-extrabold text-[#302924]">{group.label}</span>
                {group.hasTestOrLegacyNote ? <span className="rounded-md bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-800">Test/legacy note</span> : null}
              </div>
              <p className="mt-1 text-[10.5px] text-[#756960]">{showBrand ? `${group.brandNames.join(", ")} · ` : ""}{inventorySourceLabel(group.source)} · {formatDateTime(group.createdAt)}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-[#756960]" title={group.actor?.email ?? undefined}><UserRound aria-hidden="true" className="h-3 w-3" />{group.actor ? `${group.actor.displayName} · ${group.actor.roleLabel}` : "System"}</p>
            </div>
            <div className="flex items-center gap-4 text-[10.5px] text-[#756960]">
              <span><strong className="text-[#302924]">{group.rows.length}</strong> {group.rows.length === 1 ? "movement" : "movements"}</span>
              <span className={`font-extrabold tabular-nums ${group.netChange > 0 ? "text-emerald-700" : group.netChange < 0 ? "text-red-700" : "text-amber-800"}`}>{group.netChange > 0 ? "+" : ""}{group.netChange} net</span>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <ChevronDown aria-hidden="true" className="h-4 w-4 text-[#8d8076] transition-transform group-open/document:rotate-180" />
            </div>
          </summary>
          <div className="border-t border-[#eee7e1] px-4 pb-5 pt-3 sm:px-5">
            {group.href ? <div className="mb-3 flex justify-end"><Link href={group.href} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#f2e8e6] px-3 py-2 text-[10.5px] font-bold text-[#A94442] hover:bg-[#ead8d5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">Open source document<ExternalLink aria-hidden="true" className="h-3 w-3" /></Link></div> : null}
            <div className="divide-y divide-[#eee7e1] overflow-hidden rounded-xl border border-[#eee7e1] bg-white">
              {group.rows.map((row) => (
                <div key={row.id} className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(220px,1fr)_minmax(180px,.9fr)_minmax(190px,1.1fr)] sm:items-center">
                  <VariantIdentity image={row.variantImage} productName={row.productName} label={`${row.productName} · ${row.variantLabel}`} sku={row.variantSku} meta={showBrand ? row.brandName : undefined} />
                  <MovementBalance row={row} />
                  <MovementEvent row={row} />
                </div>
              ))}
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
function Select({ label, name, value, children, compact = false }: { label: string; name: string; value: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <label className="min-w-0">
      <span className={compact ? "sr-only" : "text-[10px] font-bold uppercase tracking-[0.09em] text-[#8d8076]"}>{label}</span>
      <select aria-label={compact ? label : undefined} name={name} defaultValue={value} className={compact ? "h-10 w-full min-w-0 rounded-xl border-0 bg-white px-3 text-[11.5px] font-semibold text-[#3f3630] outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25" : "mt-1.5 h-10 w-full min-w-0 rounded-xl border-0 bg-[#f4f0ec] px-3 text-[11.5px] font-semibold text-[#3f3630] outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25"}>
        {children}
      </select>
    </label>
  );
}
function DateFilter({ label, name, value, compact = false }: { label: string; name: string; value: string; compact?: boolean }) {
  return (
    <label>
      <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">{label}</span>
      <input type="date" name={name} defaultValue={value} className={compact ? "mt-1.5 h-10 w-full rounded-xl border-0 bg-[#f4f0ec] px-3 text-[11.5px] font-semibold text-[#3f3630] outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25" : `${CONTROL} mt-1.5 w-full`} />
    </label>
  );
}
