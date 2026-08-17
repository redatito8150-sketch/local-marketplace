import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowDownLeft, ArrowUpRight, Boxes, ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { DashboardEmptyState, DashboardPageHeader } from "@/components/dashboard/DashboardUI";
import AdminWorkspaceNav from "@/components/admin/AdminWorkspaceNav";
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

const PAGE_SIZE = 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_OPTIONS = [
  ["admin", "Admin adjustment"],
  ["brand_portal", "Brand adjustment"],
  ["order", "Customer order"],
  ["order_cancellation", "Order cancellation"],
  ["warehouse_transfer", "Warehouse transfer"],
  ["warehouse_correction", "Warehouse correction"],
  ["product_editor", "Product setup"],
  ["migration", "Historical migration"],
] as const;
const MOVEMENT_OPTIONS = [
  ["opening_balance", "Opening balance"],
  ["manual_adjustment", "Manual adjustment"],
  ["admin_correction", "Admin correction"],
  ["order_placed", "Order placed"],
  ["order_cancelled", "Order cancelled"],
  ["return_restocked", "Return restocked"],
  ["warehouse_transfer_received", "Warehouse received"],
  ["warehouse_transfer_shipped", "Warehouse shipped"],
] as const;

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
};
type MovementResult = Awaited<ReturnType<typeof getInventoryMovementsForAdmin>>;
type MovementRow = MovementResult["rows"][number];
const sourceLabel = (value: string) => SOURCE_OPTIONS.find(([key]) => key === value)?.[1] ?? titleCase(value);

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view: InventoryView = params.view === "activity" ? "activity" : "catalog";
  const summaries = await getInventoryBrandSummariesForAdmin();
  const activeHref = view === "activity" ? "/admin/inventory?view=activity" : "/admin/inventory";

  return (
    <div>
      <AdminWorkspaceNav workspace="inventory" activeHref={activeHref} />
      <DashboardPageHeader title="Inventory" description="Monitor stock across every brand, product, color and size from one place." />
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
  const source = SOURCE_OPTIONS.some(([key]) => key === params.source) ? params.source : undefined;
  const movementType = MOVEMENT_OPTIONS.some(([key]) => key === params.movement) ? params.movement : undefined;
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
  return <ActivityWorkspace summaries={summaries} detail={detail} selectedBrand={selectedBrand} params={params} result={movementResult} source={source} movementType={movementType} from={from} to={to} page={page} />;
}

function AllProductsCatalog({ products, brands, params }: { products: AdminInventoryProductWithBrand[]; brands: AdminInventoryBrandSummary[]; params: Params }) {
  const term = (params.q ?? "").trim().toLocaleLowerCase("en-US");
  const brandFilter = params.brand ?? "";
  const fulfillment = params.fulfillment === "partner" || params.fulfillment === "brand" ? params.fulfillment : "";
  const issuesOnly = params.issues === "1";
  const stock = params.stock === "healthy" || params.stock === "low_stock" || params.stock === "out_of_stock" ? params.stock : "";
  const status = params.status === "draft" || params.status === "published" ? params.status : "";

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
    <section className="mt-5">
      <CatalogFilters brands={brands} query={params.q ?? ""} brand={brandFilter} fulfillment={fulfillment} issuesOnly={issuesOnly} stock={stock} status={status} />
      {filtered.length ? (
        <div className="space-y-3">
          <p className="px-1 text-[10.5px] font-semibold text-[#756960]">Showing {formatCount(filtered.length)} of {formatCount(products.length)} products</p>
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
          <DashboardEmptyState title="No matching products" description="Clear the filters or search for another brand, product, color, size or SKU." />
        </div>
      )}
    </section>
  );
}

function CatalogFilters({ brands, query, brand, fulfillment, issuesOnly, stock, status }: { brands: AdminInventoryBrandSummary[]; query: string; brand: string; fulfillment: string; issuesOnly: boolean; stock: string; status: string }) {
  const active = Boolean(query || brand || fulfillment || issuesOnly || stock || status);
  return (
    <form action="/admin/inventory" className="mb-4 grid gap-2 rounded-2xl bg-[#e6e0d8] p-2 md:grid-cols-2 xl:grid-cols-[minmax(200px,1.1fr)_170px_170px_150px_150px_auto] xl:items-center">
      <input type="hidden" name="view" value="catalog" />
      <label className="relative md:col-span-2 xl:col-span-1">
        <span className="sr-only">Search inventory</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9b8d83]" />
        <input name="q" defaultValue={query} placeholder="Brand, product, color, size or SKU" className={`${CONTROL} w-full pl-9`} />
      </label>
      <label>
        <span className="sr-only">Brand</span>
        <select name="brand" defaultValue={brand} className={`${CONTROL} w-full`}>
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">Fulfillment mode</span>
        <select name="fulfillment" defaultValue={fulfillment} className={`${CONTROL} w-full`}>
          <option value="">All fulfillment modes</option>
          <option value="partner">Partner (Zakhnook stock)</option>
          <option value="brand">Brand-fulfilled</option>
        </select>
      </label>
      <label>
        <span className="sr-only">Stock status</span>
        <select name="stock" defaultValue={stock} className={`${CONTROL} w-full`}>
          <option value="">All stock levels</option>
          <option value="healthy">Healthy</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>
      </label>
      <label>
        <span className="sr-only">Product status</span>
        <select name="status" defaultValue={status} className={`${CONTROL} w-full`}>
          <option value="">All product states</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${CONTROL} flex cursor-pointer items-center gap-2`}>
          <input type="checkbox" name="issues" value="1" defaultChecked={issuesOnly} className="h-3.5 w-3.5 accent-[#C85956]" />
          Issues only
        </label>
        <button className="h-11 rounded-xl bg-[#C85956] px-4 text-[11px] font-bold text-white transition-colors hover:bg-[#b84e4b]">Apply</button>
        {active ? (
          <Link href="/admin/inventory?view=catalog" className="px-1 text-[10px] font-bold text-[#75685f] hover:text-[#C85956]">
            Clear
          </Link>
        ) : null}
      </div>
    </form>
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
  return [...groups.values()];
}

function ProductCard({ product }: { product: AdminInventoryProductWithBrand }) {
  const colors = groupProductColors(product);
  return (
    <details className="group overflow-hidden rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 bg-[#ece7e0] px-4 py-3.5 outline-none transition-colors hover:bg-[#e4ded6] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 [&::-webkit-details-marker]:hidden">
        <span className="relative h-14 w-12 flex-none overflow-hidden rounded-xl bg-[#f1eae4]">{product.image ? <Image src={product.image} alt="" fill sizes="48px" className="object-cover" /> : <Boxes className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}</span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#B94F4C]">
            <span className="relative flex h-[18px] w-[18px] flex-none items-center justify-center overflow-hidden rounded-md bg-[#fbf7f3] text-[8px] font-extrabold">
              {product.brandLogoImage ? <Image src={product.brandLogoImage} alt="" fill sizes="18px" className="object-contain p-0.5" /> : product.brandName.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate">{product.brandName}</span>
          </p>
          <h3 className="truncate text-[14px] font-extrabold text-[#403730]">{product.name}</h3>
          <p className="mt-1 text-[10.5px] text-[#756960]">
            {titleCase(product.status)} · {formatCount(colors.length)} {colors.length === 1 ? "color" : "colors"} · {formatCount(product.variants.length)} {product.variants.length === 1 ? "size" : "sizes"}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[14px] font-extrabold tabular-nums text-[#302924]">{formatCount(product.totalUnits)}</p>
          <p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">available units</p>
          {product.issueCount ? <p className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-1 text-[9.5px] font-bold text-amber-800">{formatCount(product.issueCount)} need attention</p> : null}
        </div>
        <ChevronRight aria-hidden="true" className="ml-1 h-4 w-4 flex-none text-[#a99b91] transition-transform group-open:rotate-90 group-open:text-[#C85956]" />
      </summary>
      <div className="border-t border-[#eee7e1]">
        <div className="flex items-center justify-between bg-[#e7e1da] px-4 py-2">
          <p className="text-[10px] font-semibold text-[#756960]">Open a color to inspect its sizes and stock.</p>
          <div className="flex items-center gap-3">
            <Link href={`/admin/inventory?view=activity&brand=${encodeURIComponent(product.brandSlug)}&productId=${encodeURIComponent(product.id)}`} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#756960] hover:text-[#C85956] hover:underline">
              <Activity className="h-3 w-3" />
              All movements
            </Link>
            <Link href={`/admin/products/${product.id}/edit`} className="text-[10.5px] font-bold text-[#756960] hover:text-[#C85956] hover:underline">
              Edit product
            </Link>
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
    <details className="group/color overflow-hidden rounded-2xl bg-[#f7f3ef]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 outline-none transition-colors hover:bg-[#f1ebe5] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/20 [&::-webkit-details-marker]:hidden sm:px-4">
        <ChevronRight className="h-3.5 w-3.5 flex-none text-[#9f9187] transition-transform group-open/color:rotate-90 group-open/color:text-[#C85956]" />
        <span className="relative h-12 w-10 flex-none overflow-hidden rounded-xl bg-[#eee7e1]">{image ? <Image src={image} alt={`${product.name} in ${color.label}`} fill sizes="40px" className="object-cover" /> : <Boxes className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}</span>
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-extrabold text-[#403730]">{color.label}</span>
          <span className="mt-1 block text-[10px] text-[#756960]">{formatCount(color.variants.length)} {color.variants.length === 1 ? "size" : "sizes"}</span>
        </span>
        <span className="ml-auto text-right">
          <span className="block text-[13px] font-extrabold tabular-nums text-[#302924]">{formatCount(total)}</span>
          <span className="block text-[9px] font-semibold text-[#756960]">available</span>
        </span>
        {issues ? <span className="hidden rounded-lg bg-amber-50 px-2 py-1 text-[8.5px] font-bold text-amber-800 sm:inline-flex">{formatCount(issues)} need attention</span> : <span className="hidden sm:inline-flex"><StockBadge status="in_stock" /></span>}
      </summary>
      <div className="border-t border-[#e8dfd8] bg-[#fcfaf8]">
        <div className="hidden grid-cols-[minmax(180px,1fr)_90px_90px_110px_150px] items-center px-4 py-2 text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960] md:grid">
          <span>Size / SKU</span><span>Available</span><span>Alert at</span><span>Selling</span><span>Status / movements</span>
        </div>
        <div className="divide-y divide-[#eee7e1]">{color.variants.map((variant) => <VariantSizeRow key={variant.id} variant={variant} product={product} />)}</div>
      </div>
    </details>
  );
}

function VariantSizeRow({ variant, product }: { variant: AdminInventoryProductWithBrand["variants"][number]; product: AdminInventoryProductWithBrand }) {
  const movementsHref = `/admin/inventory?view=activity&brand=${encodeURIComponent(product.brandSlug)}&productId=${encodeURIComponent(product.id)}&variantId=${encodeURIComponent(variant.id)}`;
  return (
    <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(180px,1fr)_90px_90px_110px_150px] md:items-center">
      <div className="min-w-0"><p className="text-[11.5px] font-bold text-[#51473f]">{variant.size || "One size"}</p><code className="mt-1 block truncate text-[9.5px] text-[#756960]">{variant.sku}</code></div>
      <div className="flex items-center justify-between md:block"><span className="text-[9.5px] font-bold uppercase text-[#756960] md:hidden">Available</span><span className="text-[12px] font-extrabold tabular-nums text-[#403730]">{formatCount(variant.quantity)}</span></div>
      <div className="flex items-center justify-between md:block"><span className="text-[9.5px] font-bold uppercase text-[#756960] md:hidden">Alert at</span><span className="text-[10.5px] tabular-nums text-[#756960]">{formatCount(variant.threshold)}</span></div>
      <div className="flex items-center justify-between md:block"><span className="text-[9.5px] font-bold uppercase text-[#756960] md:hidden">Selling</span><span className="text-[10.5px] font-semibold text-[#756960]">{titleCase(variant.sellingStatus)}</span></div>
      <div className="flex items-center justify-between gap-2 md:justify-start">
        <StockBadge status={variant.stockStatus} />
        <Link href={movementsHref} aria-label={`View movement history for ${variant.sku}`} className="inline-flex items-center gap-1 rounded-lg bg-[#e6e0d8] px-2.5 py-1.5 text-[9.5px] font-bold text-[#51473f] transition-colors hover:bg-[#242424] hover:text-white">
          <Activity className="h-3 w-3" />
          Movements
        </Link>
      </div>
    </div>
  );
}

function ActivityWorkspace({ summaries, detail, selectedBrand, params, result, source, movementType, from, to, page }: { summaries: AdminInventoryBrandSummary[]; detail: AdminInventoryBrandDetail | null; selectedBrand: AdminInventoryBrandSummary | null; params: Params; result: MovementResult | null; source?: string; movementType?: string; from?: string; to?: string; page: number }) {
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
  const selectedProductName = detail?.products.find((product) => product.id === params.productId)?.name;
  const selectedVariantSku = detail?.products.flatMap((product) => product.variants).find((variant) => variant.id === params.variantId)?.sku;
  const heading = selectedVariantSku ?? selectedProductName ?? (selectedBrand ? `${selectedBrand.name} timeline` : "All brands timeline");
  return (
    <section className="mt-5">
      <MovementFilters summaries={summaries} detail={detail} selectedBrand={selectedBrand} params={params} source={source} movementType={movementType} from={from} to={to} clearHref={clearHref} />
      <div className="mt-4 overflow-hidden rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
        <header className="flex items-center justify-between border-b border-[#eee7e1] px-5 py-4">
          <div>
            <h3 className="text-[12px] font-extrabold text-[#302924]">{heading}</h3>
            <p className="mt-1 text-[10px] text-[#8d8076]">{formatCount(result?.total ?? 0)} sequential, immutable movements.</p>
          </div>
          <div className="hidden gap-2 text-[9.5px] font-bold text-[#8d8076] sm:flex">
            <span className="inline-flex items-center gap-1">
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-700" />
              Stock in
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowUpRight className="h-3.5 w-3.5 text-red-700" />
              Stock out
            </span>
          </div>
        </header>
        {result?.rows.length ? <ActivityRows rows={result.rows} showBrand={!selectedBrand} /> : <DashboardEmptyState title="No movements found" description="Adjust the filters or wait for the first inventory change." />}
      </div>
      {totalPages > 1 ? (
        <nav className="mt-4 flex items-center justify-between rounded-[22px] border-0 bg-[#ece7e0] px-4 py-3 shadow-[0_12px_32px_rgba(72,50,36,.07)]">
          <span>
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#e4d9d1] px-3 text-[10.5px] font-bold">
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Link>
            ) : null}
          </span>
          <p className="text-[10.5px] text-[#8d8076]">
            Page <strong>{page}</strong> of <strong>{totalPages}</strong>
          </p>
          <span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="inline-flex h-9 items-center gap-1 rounded-xl bg-[#242424] px-3 text-[10.5px] font-bold text-white">
                Next
                <ChevronRight className="h-3.5 w-3.5" />
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
  const advancedActive = Boolean(source || movementType || from || to);
  return (
    <form action="/admin/inventory" className="rounded-[22px] border-0 bg-[#ece7e0] p-3 shadow-[0_12px_32px_rgba(72,50,36,.07)] sm:p-4">
      <input type="hidden" name="view" value="activity" />
      <div className={`grid min-w-0 gap-3 md:grid-cols-2 ${detail ? "xl:grid-cols-[minmax(220px,1.25fr)_170px_minmax(180px,1fr)_minmax(220px,1.25fr)_auto]" : "xl:grid-cols-[minmax(260px,1fr)_190px_auto]"} xl:items-end`}>
        <label className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">Search</span>
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9b8d83]" />
            <input name="q" defaultValue={params.q ?? ""} placeholder="Product, brand or SKU" className={`${CONTROL} w-full pl-9`} />
          </div>
        </label>
        <Select label="Brand" name="brand" value={selectedBrand?.slug ?? ""}>
          <option value="">All brands</option>
          {summaries.map((brand) => (
            <option key={brand.id} value={brand.slug}>
              {brand.name}
            </option>
          ))}
        </Select>
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
        <div className="flex h-11 items-center gap-2 xl:justify-end">
          <button className="h-11 rounded-xl bg-[#C85956] px-5 text-[12px] font-bold text-white">Apply</button>
          {active ? (
            <Link href={clearHref} className="text-[10.5px] font-bold text-[#8d8076] hover:text-[#C85956]">
              Clear
            </Link>
          ) : null}
        </div>
      </div>
      <details className="group/filters mt-3 border-t border-[#d9cec5] pt-3" open={advancedActive || undefined}>
        <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 text-[10.5px] font-bold text-[#665a52] outline-none hover:text-[#C85956] focus-visible:ring-2 focus-visible:ring-[#C85956]/25 [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          More filters
          {advancedActive ? <span className="rounded-full bg-[#f2dedd] px-2 py-0.5 text-[9px] text-[#A94442]">Active</span> : null}
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/filters:rotate-180" />
        </summary>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Select label="Source" name="source" value={source ?? ""}>
            <option value="">All sources</option>
            {SOURCE_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          <Select label="Movement" name="movement" value={movementType ?? ""}>
            <option value="">All movements</option>
            {MOVEMENT_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </Select>
          <DateFilter label="From" name="from" value={from ?? ""} />
          <DateFilter label="To" name="to" value={to ?? ""} />
        </div>
      </details>
    </form>
  );
}

function ActivityRows({ rows, showBrand }: { rows: MovementRow[]; showBrand: boolean }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[930px] text-left text-[11px]">
          <thead className="border-b border-[#dfd1c7] bg-white/15 text-[9px] font-bold uppercase tracking-[0.08em] text-[#675b53]">
            <tr>
              {showBrand ? <th className="px-5 py-3">Brand</th> : null}
              <th className={showBrand ? "" : "px-5 py-3"}>Variant</th>
              <th>Change</th>
              <th>Before / after</th>
              <th>Reason</th>
              <th>Source</th>
              <th className="pr-5 text-right">Recorded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0e9e3]">
            {rows.map((row) => (
              <tr key={row.id}>
                {showBrand ? <td className="px-5 py-3 text-[10.5px] font-bold text-[#5b5049]">{row.brandName}</td> : null}
                <td className={showBrand ? "py-3" : "px-5 py-3"}>
                  <VariantIdentity image={row.variantImage} productName={row.productName} label={`${row.productName} · ${row.variantLabel}`} sku={row.variantSku} />
                </td>
                <td>
                  <span className={`font-extrabold ${row.quantityDelta > 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {row.quantityDelta > 0 ? "+" : ""}
                    {row.quantityDelta}
                  </span>
                  <p className="text-[8.5px] text-[#94867c]">{titleCase(row.movementType)}</p>
                </td>
                <td className="font-bold tabular-nums">
                  {row.previousQuantity} → {row.newQuantity}
                </td>
                <td className="max-w-[260px] pr-4">
                  <p className="font-semibold">{row.reason}</p>
                  {row.note ? <p className="truncate text-[9px] text-[#8d8076]">{row.note}</p> : null}
                </td>
                <td>
                  <span className="rounded-md border border-white/35 bg-white/25 px-2 py-1 text-[9px] font-bold text-[#51473f]">{sourceLabel(row.source)}</span>
                </td>
                <td className="whitespace-nowrap pr-5 text-right text-[9.5px] text-[#8d8076]">{formatDateTime(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-[#eee7e1] md:hidden">
        {rows.map((row) => (
          <article key={row.id} className="px-4 py-4">
            {showBrand ? <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.06em] text-[#C85956]">{row.brandName}</p> : null}
            <div className="flex justify-between gap-3">
              <VariantIdentity image={row.variantImage} productName={row.productName} label={`${row.productName} · ${row.variantLabel}`} sku={row.variantSku} />
              <span className={`font-extrabold ${row.quantityDelta > 0 ? "text-emerald-700" : "text-red-700"}`}>
                {row.quantityDelta > 0 ? "+" : ""}
                {row.quantityDelta}
              </span>
            </div>
            <div className="mt-3 flex justify-between text-[10px]">
              <span>{row.reason}</span>
              <span>
                {row.previousQuantity} → {row.newQuantity}
              </span>
            </div>
            <div className="mt-2 flex justify-between text-[9px] text-[#94867c]">
              <span>{sourceLabel(row.source)}</span>
              <span>{formatDateTime(row.createdAt)}</span>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
function Select({ label, name, value, children }: { label: string; name: string; value: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">{label}</span>
      <select name={name} defaultValue={value} className={`${CONTROL} mt-1.5 w-full`}>
        {children}
      </select>
    </label>
  );
}
function DateFilter({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <label>
      <span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">{label}</span>
      <input type="date" name={name} defaultValue={value} className={`${CONTROL} mt-1.5 w-full`} />
    </label>
  );
}
