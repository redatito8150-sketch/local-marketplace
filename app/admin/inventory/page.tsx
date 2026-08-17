import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowDownLeft, ArrowLeft, ArrowUpRight, Boxes, ChevronLeft, ChevronRight, PackageSearch, Search, Warehouse } from "lucide-react";
import { DashboardEmptyState, DashboardPageHeader, dashboardButtonPrimary } from "@/components/dashboard/DashboardUI";
import { getInventoryBrandDetailForAdmin, getInventoryBrandSummariesForAdmin, getInventoryMovementsForAdmin, type AdminInventoryBrandDetail, type AdminInventoryBrandSummary } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const CONTROL = "h-11 min-w-0 rounded-xl border-0 bg-[#e6e0d8] px-3 text-[12.5px] font-medium text-[#3f3630] outline-none shadow-[0_10px_28px_rgba(72,50,36,.08)] placeholder:text-[#75675e] focus-visible:bg-[#ded7cf] focus-visible:ring-2 focus-visible:ring-[#C85956]/20";
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

type InventoryView = "warehouse" | "catalog" | "activity";
type Params = {
  view?: string;
  q?: string;
  brand?: string;
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
const formatCount = (value: number) => NUMBER_FORMAT.format(value);
const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
const sourceLabel = (value: string) => SOURCE_OPTIONS.find(([key]) => key === value)?.[1] ?? titleCase(value);

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const view: InventoryView = params.view === "warehouse" || params.view === "activity" ? params.view : "catalog";
  const summaries = await getInventoryBrandSummariesForAdmin();
  const directoryBrands = view === "warehouse" ? summaries.filter((brand) => brand.fulfillmentMode === "zakhnook_fulfilled") : summaries;
  const detail = params.brand
    ? await getInventoryBrandDetailForAdmin(params.brand, {
        warehouseOnly: view === "warehouse",
      })
    : null;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const source = SOURCE_OPTIONS.some(([key]) => key === params.source) ? params.source : undefined;
  const movementType = MOVEMENT_OPTIONS.some(([key]) => key === params.movement) ? params.movement : undefined;
  const from = params.from && DATE_PATTERN.test(params.from) ? params.from : undefined;
  const to = params.to && DATE_PATTERN.test(params.to) ? params.to : undefined;
  const selectedProduct = detail?.products.find((product) => product.id === params.productId);
  const selectedVariant = detail?.products.flatMap((product) => product.variants).find((variant) => variant.id === params.variantId);
  const movementResult =
    view === "activity" && detail
      ? await getInventoryMovementsForAdmin({
          brand: detail.name,
          productId: selectedProduct?.id,
          variantId: selectedVariant?.id,
          source,
          movementType,
          from,
          to,
          page,
          limit: PAGE_SIZE,
        })
      : null;
  const partnerBrands = summaries.filter((brand) => brand.fulfillmentMode === "zakhnook_fulfilled");
  const partnerUnits = partnerBrands.reduce((sum, brand) => sum + brand.totalUnits, 0);
  const allUnits = summaries.reduce((sum, brand) => sum + brand.totalUnits, 0);

  return (
    <div>
      <DashboardPageHeader
        title="Inventory"
        description={selectedProduct ? "Every immutable stock movement recorded for this product." : undefined}
        actions={
          <Link href="/admin/warehouse" className={dashboardButtonPrimary}>
            <Warehouse className="mr-2 h-4 w-4" />
            Warehouse documents
          </Link>
        }
      />
      <InventoryNavigation view={view} allUnits={allUnits} partnerUnits={partnerUnits} />
      {view === "activity" ? <ActivityWorkspace summaries={summaries} detail={detail} params={params} result={movementResult} source={source} movementType={movementType} from={from} to={to} page={page} /> : detail ? <BrandInventory detail={detail} view={view} params={params} /> : <BrandDirectory summaries={directoryBrands} view={view} query={params.q ?? ""} />}
    </div>
  );
}

function InventoryNavigation({ view, allUnits, partnerUnits }: { view: InventoryView; allUnits: number; partnerUnits: number }) {
  const areas = [
    { view: "catalog" as const, icon: PackageSearch, label: "Inventory", meta: `${formatCount(allUnits)} units`, href: "/admin/inventory?view=catalog" },
    { view: "warehouse" as const, icon: Warehouse, label: "Warehouse", meta: `${formatCount(partnerUnits)} units`, href: "/admin/inventory?view=warehouse" },
    { view: "activity" as const, icon: Activity, label: "Variant movements", meta: "Full ledger", href: "/admin/inventory?view=activity" },
  ];
  return (
    <nav aria-label="Inventory areas" className="mt-5 grid grid-cols-1 gap-1 rounded-2xl bg-[#e6e0d8] p-1 sm:grid-cols-3">
      {areas.map((area) => {
        const active = view === area.view;
        const Icon = area.icon;
        return <Link key={area.view} href={area.href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-2.5 rounded-xl px-3.5 py-2 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 ${active ? "bg-[#f8f4f0] text-[#302924] shadow-[0_5px_14px_rgba(72,50,36,.08)]" : "text-[#75685f] hover:bg-[#ded7cf] hover:text-[#403730]"}`}>
          <Icon className={`h-4 w-4 flex-none ${active ? "text-[#C85956]" : "text-[#92847a]"}`} />
          <span>{area.label}</span>
          <span className={`ml-auto text-[9px] font-semibold tabular-nums ${active ? "text-[#75685f]" : "text-[#9b8d83]"}`}>{area.meta}</span>
        </Link>;
      })}
    </nav>
  );
}

function BrandDirectory({ summaries, view, query }: { summaries: AdminInventoryBrandSummary[]; view: InventoryView; query: string }) {
  const term = query.trim().toLocaleLowerCase("en-US");
  const brands = summaries.filter((brand) => !term || brand.searchText.includes(term));
  const warehouse = view === "warehouse";
  return (
    <section className="mt-5 overflow-hidden rounded-[20px] border-0 bg-transparent shadow-none">
      <header className={`flex flex-col gap-4 border-b-0 px-0 py-4 sm:flex-row sm:items-end ${warehouse ? "sm:justify-between" : "sm:justify-start"}`}>
        {warehouse ? (
          <div>
            <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#C85956]">Partner stock</p>
            <h2 className="mt-1 text-[15px] font-extrabold text-[#302924]">Zakhnook warehouse inventory</h2>
            <p className="mt-1 text-[10.5px] text-[#8d8076]">Only Zakhnook-fulfilled partner brands. Open a brand to inspect its products and variants.</p>
          </div>
        ) : null}
        <form action="/admin/inventory" className="relative w-full sm:w-[270px]">
          <input type="hidden" name="view" value={view} />
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2948a]" />
          <input name="q" defaultValue={query} placeholder="Brand, product or SKU" className={`${CONTROL} w-full pl-10`} />
        </form>
      </header>
      {brands.length ? (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {brands.map((brand) => (
            <BrandCard key={brand.id} brand={brand} view={view} />
          ))}
        </div>
      ) : (
        <DashboardEmptyState title="No brands found" description="Try another brand name." />
      )}
    </section>
  );
}

function BrandCard({ brand, view }: { brand: AdminInventoryBrandSummary; view: InventoryView }) {
  const issues = brand.lowStockCount + brand.outOfStockCount;
  return (
    <Link href={`/admin/inventory?view=${view}&brand=${encodeURIComponent(brand.slug)}`} className="group flex min-h-[148px] flex-col rounded-[22px] border-0 bg-[#ece7e0] p-4 shadow-[0_12px_32px_rgba(72,50,36,.08)] transition hover:-translate-y-0.5 hover:bg-[#e4ded6] hover:shadow-[0_16px_36px_rgba(72,50,36,.11)]">
      <div className="flex items-start gap-3">
        <BrandMark brand={brand} />
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-extrabold text-[#403730] group-hover:text-[#C85956]">{brand.name}</h3>
          <p className="mt-1 text-[9.5px] text-[#8d8076]">{brand.fulfillmentMode === "zakhnook_fulfilled" ? "Zakhnook fulfilled" : "Brand fulfilled"}</p>
        </div>
        <ChevronRight className="ml-auto mt-2 h-4 w-4 text-[#b6aaa1] group-hover:text-[#C85956]" />
      </div>
      <div className="mt-auto grid grid-cols-3 gap-2 border-t border-[#eee7e1] pt-3">
        <Metric label="Products" value={brand.productCount} />
        <Metric label="Variants" value={brand.variantCount} />
        <Metric label="Units" value={brand.totalUnits} />
      </div>
      <p className={`mt-2 text-[9.5px] font-bold ${issues ? "text-amber-700" : "text-emerald-700"}`}>{issues ? `${formatCount(issues)} variants need attention` : "Stock levels look healthy"}</p>
    </Link>
  );
}

function BrandMark({ brand }: { brand: { name: string; logoImage: string | null } }) {
  return <span className="relative flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-xl border-0 bg-[#fbf7f3] text-[14px] font-extrabold text-[#C85956]">{brand.logoImage ? <Image src={brand.logoImage} alt={`${brand.name} logo`} fill sizes="44px" className="object-contain p-1" /> : brand.name.slice(0, 1).toUpperCase()}</span>;
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="block text-[8.5px] font-bold uppercase tracking-[0.07em] text-[#9a8c82]">{label}</span>
      <span className="mt-0.5 block text-[12px] font-extrabold tabular-nums text-[#403730]">{formatCount(value)}</span>
    </span>
  );
}

function BrandInventory({ detail, view, params }: { detail: AdminInventoryBrandDetail; view: InventoryView; params: Params }) {
  const term = (params.q ?? "").trim().toLocaleLowerCase("en-US");
  const stock = params.stock === "healthy" || params.stock === "low_stock" || params.stock === "out_of_stock" ? params.stock : "";
  const status = params.status === "draft" || params.status === "published" ? params.status : "";
  const products = detail.products.filter((product) => {
    const searchable = [product.name, product.status, ...product.variants.flatMap((variant) => [variant.sku, variant.label, variant.color ?? "", variant.size ?? ""])].join(" ").toLocaleLowerCase("en-US");
    if (term && !searchable.includes(term)) return false;
    if (status && product.status !== status) return false;
    if (stock === "healthy" && !product.variants.some((variant) => variant.stockStatus === "in_stock")) return false;
    if (stock && stock !== "healthy" && !product.variants.some((variant) => variant.stockStatus === stock)) return false;
    return true;
  });
  return (
    <section className="mt-5">
      <div className="mb-4 flex flex-col gap-3 rounded-[22px] border-0 bg-[#ece7e0] px-4 py-4 shadow-[0_12px_32px_rgba(72,50,36,.07)] sm:flex-row sm:items-center">
        <Link href={`/admin/inventory?view=${view}`} className="inline-flex h-9 w-fit items-center gap-1.5 rounded-xl border border-[#e6dbd3] px-3 text-[10.5px] font-bold text-[#62564d] hover:text-[#C85956]">
          <ArrowLeft className="h-3.5 w-3.5" />
          All brands
        </Link>
        <div className="flex min-w-0 items-center gap-3 sm:ml-2">
          <BrandMark brand={{ name: detail.name, logoImage: detail.logoImage }} />
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.09em] text-[#C85956]">{detail.fulfillmentMode === "zakhnook_fulfilled" ? "Zakhnook warehouse" : "Marketplace inventory"}</p>
            <h2 className="text-[16px] font-extrabold text-[#302924]">{detail.name}</h2>
            <p className="mt-0.5 text-[10px] text-[#8d8076]">{formatCount(detail.products.length)} products, grouped by color and size</p>
          </div>
        </div>
        <Link href={`/admin/inventory?view=activity&brand=${encodeURIComponent(detail.slug)}`} className="inline-flex h-9 w-fit items-center gap-2 rounded-xl bg-[#242424] px-3.5 text-[10.5px] font-bold text-white sm:ml-auto">
          <Activity className="h-3.5 w-3.5" />
          Open movement history
        </Link>
      </div>
      <CatalogFilters detail={detail} view={view} query={params.q ?? ""} stock={stock} status={status} />
      {products.length ? (
        <div className="space-y-3">
          <p className="px-1 text-[9.5px] font-semibold text-[#8d8076]">Showing {formatCount(products.length)} of {formatCount(detail.products.length)} products</p>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} brandSlug={detail.slug} />
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
          <DashboardEmptyState title="No matching products" description="Clear the filters or search for another product, color, size or SKU." />
        </div>
      )}
    </section>
  );
}

function CatalogFilters({ detail, view, query, stock, status }: { detail: AdminInventoryBrandDetail; view: InventoryView; query: string; stock: string; status: string }) {
  const active = Boolean(query || stock || status);
  return (
    <form action="/admin/inventory" className="mb-4 grid gap-2 rounded-2xl bg-[#e6e0d8] p-2 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_160px_160px_auto]">
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="brand" value={detail.slug} />
      <label className="relative sm:col-span-2 lg:col-span-1">
        <span className="sr-only">Search inventory</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9b8d83]" />
        <input name="q" defaultValue={query} placeholder="Product, color, size or SKU" className={`${CONTROL} w-full pl-9`} />
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
      <div className="flex items-center gap-2">
        <button className="h-11 rounded-xl bg-[#C85956] px-4 text-[11px] font-bold text-white transition-colors hover:bg-[#b84e4b]">Apply</button>
        {active ? <Link href={`/admin/inventory?view=${view}&brand=${encodeURIComponent(detail.slug)}`} className="px-2 text-[10px] font-bold text-[#75685f] hover:text-[#C85956]">Clear</Link> : null}
      </div>
    </form>
  );
}

type ColorGroup = { key: string; label: string; variants: AdminInventoryBrandDetail["products"][number]["variants"] };

function groupProductColors(product: AdminInventoryBrandDetail["products"][number]): ColorGroup[] {
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

function ProductCard({ product, brandSlug }: { product: AdminInventoryBrandDetail["products"][number]; brandSlug: string }) {
  const colors = groupProductColors(product);
  return (
    <details className="group overflow-hidden rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 bg-[#ece7e0] px-4 py-3.5 outline-none transition-colors hover:bg-[#e4ded6] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 [&::-webkit-details-marker]:hidden">
        <span className="relative h-14 w-12 flex-none overflow-hidden rounded-xl bg-[#f1eae4]">{product.image ? <Image src={product.image} alt="" fill sizes="48px" className="object-cover" /> : <Boxes className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}</span>
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-extrabold text-[#403730]">{product.name}</h3>
          <p className="mt-1 text-[9.5px] text-[#8d8076]">
            {titleCase(product.status)} · {formatCount(colors.length)} {colors.length === 1 ? "color" : "colors"} · {formatCount(product.variants.length)} {product.variants.length === 1 ? "size" : "sizes"}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[14px] font-extrabold tabular-nums text-[#302924]">{formatCount(product.totalUnits)}</p>
          <p className="text-[8.5px] font-bold uppercase tracking-[0.07em] text-[#94867c]">available units</p>
          {product.issueCount ? <p className="mt-1 text-[9px] font-bold text-amber-700">{formatCount(product.issueCount)} need attention</p> : null}
        </div>
        <ChevronRight aria-hidden="true" className="ml-1 h-4 w-4 flex-none text-[#a99b91] transition-transform group-open:rotate-90 group-open:text-[#C85956]" />
      </summary>
      <div className="border-t border-[#eee7e1]">
        <div className="flex items-center justify-between bg-[#e7e1da] px-4 py-2">
          <p className="text-[9px] font-semibold text-[#8d8076]">Open a color to inspect its sizes and stock.</p>
          <Link href={`/admin/products/${product.id}/edit`} className="text-[9.5px] font-bold text-[#8d8076] hover:text-[#C85956] hover:underline">
            Edit product
          </Link>
        </div>
        {colors.length ? <div className="space-y-2 p-2.5 sm:p-3">{colors.map((color) => <ColorInventoryGroup key={color.key} product={product} color={color} brandSlug={brandSlug} />)}</div> : <DashboardEmptyState title="No variants" description="This product does not have an active inventory variant yet." />}
      </div>
    </details>
  );
}

function ColorInventoryGroup({ product, color, brandSlug }: { product: AdminInventoryBrandDetail["products"][number]; color: ColorGroup; brandSlug: string }) {
  const total = color.variants.reduce((sum, variant) => sum + variant.quantity, 0);
  const issues = color.variants.filter((variant) => variant.stockStatus !== "in_stock").length;
  const image = color.variants[0]?.image ?? product.image;
  return (
    <details className="group/color overflow-hidden rounded-2xl bg-[#f7f3ef]">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 outline-none transition-colors hover:bg-[#f1ebe5] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/20 [&::-webkit-details-marker]:hidden sm:px-4">
        <ChevronRight className="h-3.5 w-3.5 flex-none text-[#9f9187] transition-transform group-open/color:rotate-90 group-open/color:text-[#C85956]" />
        <span className="relative h-12 w-10 flex-none overflow-hidden rounded-xl bg-[#eee7e1]">{image ? <Image src={image} alt={`${product.name} in ${color.label}`} fill sizes="40px" className="object-cover" /> : <Boxes className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}</span>
        <span className="min-w-0">
          <span className="block truncate text-[11.5px] font-extrabold text-[#403730]">{color.label}</span>
          <span className="mt-1 block text-[9px] text-[#8d8076]">{formatCount(color.variants.length)} {color.variants.length === 1 ? "size" : "sizes"}</span>
        </span>
        <span className="ml-auto text-right">
          <span className="block text-[13px] font-extrabold tabular-nums text-[#302924]">{formatCount(total)}</span>
          <span className="block text-[8px] font-semibold text-[#94867c]">available</span>
        </span>
        {issues ? <span className="hidden rounded-lg bg-amber-50 px-2 py-1 text-[8.5px] font-bold text-amber-800 sm:inline-flex">{formatCount(issues)} need attention</span> : <span className="hidden sm:inline-flex"><StockBadge status="in_stock" /></span>}
      </summary>
      <div className="border-t border-[#e8dfd8] bg-[#fcfaf8]">
        <div className="hidden grid-cols-[minmax(180px,1fr)_90px_90px_110px_120px] items-center px-4 py-2 text-[8.5px] font-bold uppercase tracking-[0.07em] text-[#94867c] md:grid">
          <span>Size / SKU</span><span>Available</span><span>Alert at</span><span>Selling</span><span>Status</span>
        </div>
        <div className="divide-y divide-[#eee7e1]">{color.variants.map((variant) => <VariantSizeRow key={variant.id} variant={variant} product={product} brandSlug={brandSlug} />)}</div>
      </div>
    </details>
  );
}

function VariantSizeRow({ variant, product, brandSlug }: { variant: AdminInventoryBrandDetail["products"][number]["variants"][number]; product: AdminInventoryBrandDetail["products"][number]; brandSlug: string }) {
  return <div className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(180px,1fr)_90px_90px_110px_120px] md:items-center">
    <div className="min-w-0"><p className="text-[10.5px] font-bold text-[#51473f]">{variant.size || "One size"}</p><code className="mt-1 block truncate text-[8.5px] text-[#94867c]">{variant.sku}</code></div>
    <div className="flex items-center justify-between md:block"><span className="text-[8.5px] font-bold uppercase text-[#9a8c82] md:hidden">Available</span><span className="text-[12px] font-extrabold tabular-nums text-[#403730]">{formatCount(variant.quantity)}</span></div>
    <div className="flex items-center justify-between md:block"><span className="text-[8.5px] font-bold uppercase text-[#9a8c82] md:hidden">Alert at</span><span className="text-[10.5px] tabular-nums text-[#756960]">{formatCount(variant.threshold)}</span></div>
    <div className="flex items-center justify-between md:block"><span className="text-[8.5px] font-bold uppercase text-[#9a8c82] md:hidden">Selling</span><span className="text-[9.5px] font-semibold text-[#756960]">{titleCase(variant.sellingStatus)}</span></div>
    <div className="flex items-center justify-between md:block"><span className="text-[8.5px] font-bold uppercase text-[#9a8c82] md:hidden">Status</span><Link href={`/admin/inventory?view=activity&brand=${encodeURIComponent(brandSlug)}&productId=${encodeURIComponent(product.id)}&variantId=${encodeURIComponent(variant.id)}`} aria-label={`Open movement history for ${variant.sku}`}><StockBadge status={variant.stockStatus} /></Link></div>
  </div>;
}
function VariantIdentity({ image, productName, label, sku }: { image: string; productName: string; label: string; sku: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative h-11 w-9 flex-none overflow-hidden rounded-lg bg-[#f1eae4]">{image ? <Image src={image} alt={`${productName}, ${label}`} fill sizes="36px" className="object-cover" /> : <Boxes className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}</span>
      <span className="min-w-0">
        <span className="block truncate text-[11px] font-bold text-[#403730]">{label}</span>
        <code className="mt-1 block truncate text-[9px] text-[#91837a]">{sku}</code>
      </span>
    </div>
  );
}
function StockBadge({ status }: { status: "in_stock" | "low_stock" | "out_of_stock" }) {
  const style = status === "in_stock" ? "bg-emerald-50/55 text-emerald-800" : status === "low_stock" ? "bg-amber-50/55 text-amber-800" : "bg-red-50/55 text-red-800";
  return <span className={`inline-flex rounded-lg px-2 py-1 text-[9px] font-extrabold ${style}`}>{status === "in_stock" ? "Healthy" : status === "low_stock" ? "Low stock" : "Out of stock"}</span>;
}

function ActivityWorkspace({ summaries, detail, params, result, source, movementType, from, to, page }: { summaries: AdminInventoryBrandSummary[]; detail: AdminInventoryBrandDetail | null; params: Params; result: MovementResult | null; source?: string; movementType?: string; from?: string; to?: string; page: number }) {
  if (!params.brand || !detail)
    return (
      <section className="mt-5 overflow-hidden rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
        <header className="border-b border-[#eee7e1] px-5 py-4">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#C85956]">Movement ledger</p>
          <h2 className="mt-1 text-[15px] font-extrabold text-[#302924]">Choose a brand first</h2>
          <p className="mt-1 text-[10.5px] text-[#8d8076]">Each brand keeps its own clean timeline. Nothing from other brands is mixed into it.</p>
        </header>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {summaries.map((brand) => (
            <BrandCard key={brand.id} brand={brand} view="activity" />
          ))}
        </div>
      </section>
    );
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));
  const clearHref = `/admin/inventory?view=activity&brand=${encodeURIComponent(detail.slug)}`;
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value && key !== "page") search.set(key, value);
    });
    search.set("view", "activity");
    if (target > 1) search.set("page", String(target));
    return `/admin/inventory?${search}`;
  };
  return (
    <section className="mt-5">
      <div className="mb-4 flex items-center gap-3 rounded-[22px] border-0 bg-[#ece7e0] px-4 py-3 shadow-[0_12px_32px_rgba(72,50,36,.07)]">
        <Link href="/admin/inventory?view=activity" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e6dbd3] px-3 text-[10.5px] font-bold text-[#62564d] hover:text-[#C85956]">
          <ArrowLeft className="h-3.5 w-3.5" />
          All brands
        </Link>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Movement history</p>
          <h2 className="text-[14px] font-extrabold text-[#302924]">{detail.name}</h2>
        </div>
      </div>
      <MovementFilters detail={detail} params={params} source={source} movementType={movementType} from={from} to={to} clearHref={clearHref} />
      <div className="mt-4 overflow-hidden rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
        <header className="flex items-center justify-between border-b border-[#eee7e1] px-5 py-4">
          <div>
            <h3 className="text-[12px] font-extrabold text-[#302924]">{params.variantId ? (detail.products.flatMap((product) => product.variants).find((variant) => variant.id === params.variantId)?.sku ?? detail.name) : params.productId ? (detail.products.find((product) => product.id === params.productId)?.name ?? detail.name) : `${detail.name} timeline`}</h3>
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
        {result?.rows.length ? <ActivityRows rows={result.rows} /> : <DashboardEmptyState title="No movements found" description="Adjust the filters or wait for the first inventory change." />}
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

function MovementFilters({ detail, params, source, movementType, from, to, clearHref }: { detail: AdminInventoryBrandDetail; params: Params; source?: string; movementType?: string; from?: string; to?: string; clearHref: string }) {
  const active = [params.productId, params.variantId, source, movementType, from, to].some(Boolean);
  return (
    <form action="/admin/inventory" className="rounded-[22px] border-0 bg-[#ece7e0] p-4 shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <input type="hidden" name="view" value="activity" />
      <input type="hidden" name="brand" value={detail.slug} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(190px,1.15fr)_minmax(190px,1.2fr)_155px_155px_135px_135px_auto] xl:items-end">
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
        <Select label="Source" name="source" value={source ?? ""}>
          <option value="">All sources</option>
          {SOURCE_OPTIONS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        <Select label="Movement" name="movement" value={movementType ?? ""}>
          <option value="">All movements</option>
          {MOVEMENT_OPTIONS.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
        <DateFilter label="From" name="from" value={from ?? ""} />
        <DateFilter label="To" name="to" value={to ?? ""} />
        <div className="flex h-11 items-center gap-2">
          <button className="h-11 rounded-xl bg-[#C85956] px-5 text-[12px] font-bold text-white">Apply</button>
          {active ? (
            <Link href={clearHref} className="text-[10.5px] font-bold text-[#8d8076] hover:text-[#C85956]">
              Clear
            </Link>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function ActivityRows({ rows }: { rows: MovementRow[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[930px] text-left text-[11px]">
          <thead className="border-b border-[#dfd1c7] bg-white/15 text-[9px] font-bold uppercase tracking-[0.08em] text-[#675b53]">
            <tr>
              <th className="px-5 py-3">Variant</th>
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
                <td className="px-5 py-3">
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
