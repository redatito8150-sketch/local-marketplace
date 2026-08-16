import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowDownLeft, ArrowLeft, ArrowUpRight, Boxes, ChevronLeft, ChevronRight, PackageSearch, Search, Warehouse } from "lucide-react";
import AdminWorkspaceNav from "@/components/admin/AdminWorkspaceNav";
import { DashboardEmptyState, DashboardPageHeader, dashboardButtonPrimary } from "@/components/dashboard/DashboardUI";
import { getInventoryBrandDetailForAdmin, getInventoryBrandSummariesForAdmin, getInventoryMovementsForAdmin, type AdminInventoryBrandDetail, type AdminInventoryBrandSummary } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const CONTROL = "h-11 min-w-0 rounded-xl border-0 bg-[#eeeae4] px-3 text-[12.5px] font-medium text-[#3f3630] outline-none shadow-[0_10px_28px_rgba(72,50,36,.08)] placeholder:text-[#75675e] focus-visible:bg-[#e6e1da] focus-visible:ring-2 focus-visible:ring-[#C85956]/20";
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
  const movementResult =
    view === "activity" && detail
      ? await getInventoryMovementsForAdmin({
          brand: detail.name,
          productId: selectedProduct?.id,
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
      <div className="mt-6">
        <AdminWorkspaceNav workspace="inventory" activeHref="/admin/inventory" />
      </div>
      <nav aria-label="Inventory areas" className="grid gap-4 md:grid-cols-3">
        <Area icon={PackageSearch} label="All inventory" value={`${formatCount(allUnits)} units`} note={`${formatCount(summaries.length)} marketplace brands`} href="/admin/inventory?view=catalog" active={view === "catalog"} />
        <Area icon={Warehouse} label="Zakhnook warehouse" value={`${formatCount(partnerUnits)} units`} note={`${formatCount(partnerBrands.length)} partner brands only`} href="/admin/inventory?view=warehouse" active={view === "warehouse"} />
        <Area icon={Activity} label="Movement history" note="Follow one brand or product" href="/admin/inventory?view=activity" active={view === "activity"} />
      </nav>
      {view === "activity" ? <ActivityWorkspace summaries={summaries} detail={detail} params={params} result={movementResult} source={source} movementType={movementType} from={from} to={to} page={page} /> : detail ? <BrandInventory detail={detail} view={view} /> : <BrandDirectory summaries={directoryBrands} view={view} query={params.q ?? ""} />}
    </div>
  );
}

function Area({ icon: Icon, label, value, note, href, active }: { icon: React.ElementType; label: string; value?: string; note: string; href: string; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`group flex min-h-[88px] items-center gap-3 rounded-[22px] border-0 px-4 py-3 shadow-[0_12px_32px_rgba(72,50,36,.07)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(72,50,36,.1)] ${active ? "bg-[#e7e2dc]" : "bg-[#f3f0eb] hover:bg-[#ebe7e1]"}`}>
      <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${active ? "bg-[#f5dcd5] text-[#C85956]" : "bg-[#fbf7f3] text-[#75685f]"}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#75685f]">{label}</span>
        {value ? <span className="mt-0.5 block text-[13px] font-extrabold tabular-nums text-[#302924]">{value}</span> : null}
        <span className="mt-0.5 block text-[9.5px] font-medium text-[#75685f]">{note}</span>
      </span>
      <ChevronRight className={`ml-auto h-4 w-4 ${active ? "text-[#C85956]" : "text-[#9f9187] group-hover:text-[#C85956]"}`} />
    </Link>
  );
}

function BrandDirectory({ summaries, view, query }: { summaries: AdminInventoryBrandSummary[]; view: InventoryView; query: string }) {
  const term = query.trim().toLocaleLowerCase("en-US");
  const brands = summaries.filter((brand) => !term || brand.name.toLocaleLowerCase("en-US").includes(term));
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
          <input name="q" defaultValue={query} placeholder="Find a brand…" className={`${CONTROL} w-full pl-10`} />
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
    <Link href={`/admin/inventory?view=${view}&brand=${encodeURIComponent(brand.slug)}`} className="group flex min-h-[148px] flex-col rounded-[22px] border-0 bg-[#f3f0eb] p-4 shadow-[0_12px_32px_rgba(72,50,36,.08)] transition hover:-translate-y-0.5 hover:bg-[#ebe7e1] hover:shadow-[0_16px_36px_rgba(72,50,36,.11)]">
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

function BrandInventory({ detail, view }: { detail: AdminInventoryBrandDetail; view: InventoryView }) {
  return (
    <section className="mt-5">
      <div className="mb-4 flex flex-col gap-3 rounded-[22px] border-0 bg-[#f3f0eb] px-4 py-4 shadow-[0_12px_32px_rgba(72,50,36,.07)] sm:flex-row sm:items-center">
        <Link href={`/admin/inventory?view=${view}`} className="inline-flex h-9 w-fit items-center gap-1.5 rounded-xl border border-[#e6dbd3] px-3 text-[10.5px] font-bold text-[#62564d] hover:text-[#C85956]">
          <ArrowLeft className="h-3.5 w-3.5" />
          All brands
        </Link>
        <div className="flex min-w-0 items-center gap-3 sm:ml-2">
          <BrandMark brand={{ name: detail.name, logoImage: detail.logoImage }} />
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.09em] text-[#C85956]">{detail.fulfillmentMode === "zakhnook_fulfilled" ? "Zakhnook warehouse" : "Marketplace inventory"}</p>
            <h2 className="text-[16px] font-extrabold text-[#302924]">{detail.name}</h2>
            <p className="mt-0.5 text-[10px] text-[#8d8076]">{formatCount(detail.products.length)} products · grouped by product and variant</p>
          </div>
        </div>
        <Link href={`/admin/inventory?view=activity&brand=${encodeURIComponent(detail.slug)}`} className="inline-flex h-9 w-fit items-center gap-2 rounded-xl bg-[#242424] px-3.5 text-[10.5px] font-bold text-white sm:ml-auto">
          <Activity className="h-3.5 w-3.5" />
          Open movement history
        </Link>
      </div>
      {detail.products.length ? (
        <div className="space-y-3">
          {detail.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border-0 bg-[#f3f0eb] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
          <DashboardEmptyState title="No products in this brand" description="Products will appear here after they are created." />
        </div>
      )}
    </section>
  );
}

function ProductCard({ product }: { product: AdminInventoryBrandDetail["products"][number] }) {
  return (
    <details className="group overflow-hidden rounded-[22px] border-0 bg-[#f3f0eb] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 bg-[#f3f0eb] px-4 py-3.5 outline-none transition-colors hover:bg-[#ebe7e1] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 [&::-webkit-details-marker]:hidden">
        <span className="relative h-14 w-12 flex-none overflow-hidden rounded-xl bg-[#f1eae4]">{product.image ? <Image src={product.image} alt="" fill sizes="48px" className="object-cover" /> : <Boxes className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}</span>
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-extrabold text-[#403730]">{product.name}</h3>
          <p className="mt-1 text-[9.5px] text-[#8d8076]">
            {titleCase(product.status)} · {formatCount(product.variants.length)} variants
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
        <div className="flex justify-end bg-transparent px-4 py-2">
          <Link href={`/admin/products/${product.id}/edit`} className="text-[9.5px] font-bold text-[#8d8076] hover:text-[#C85956] hover:underline">
            Edit product
          </Link>
        </div>
        {product.variants.length ? <VariantTable product={product} /> : <DashboardEmptyState title="No variants" description="This product does not have an active inventory variant yet." />}
      </div>
    </details>
  );
}

function VariantTable({ product }: { product: AdminInventoryBrandDetail["products"][number] }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-left">
          <thead className="border-b border-[#eee7e1] text-[9px] font-bold uppercase tracking-[0.08em] text-[#94867c]">
            <tr>
              <th className="px-4 py-2.5">Variant</th>
              <th>Available</th>
              <th>Alert level</th>
              <th>Selling</th>
              <th className="pr-4 text-right">Stock status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0e9e3]">
            {product.variants.map((variant) => (
              <tr key={variant.id}>
                <td className="px-4 py-3">
                  <VariantIdentity image={variant.image} productName={product.name} label={variant.label} sku={variant.sku} />
                </td>
                <td className="text-[12px] font-extrabold tabular-nums text-[#403730]">{formatCount(variant.quantity)}</td>
                <td className="text-[11px] tabular-nums text-[#756960]">{formatCount(variant.threshold)}</td>
                <td className="text-[10px] font-semibold text-[#756960]">{titleCase(variant.sellingStatus)}</td>
                <td className="pr-4 text-right">
                  <StockBadge status={variant.stockStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-[#eee7e1] md:hidden">
        {product.variants.map((variant) => (
          <div key={variant.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <VariantIdentity image={variant.image} productName={product.name} label={variant.label} sku={variant.sku} />
              <StockBadge status={variant.stockStatus} />
            </div>
            <div className="mt-3 grid grid-cols-3 rounded-xl border border-white/35 bg-white/20 px-3 py-2">
              <Metric label="Available" value={variant.quantity} />
              <Metric label="Alert at" value={variant.threshold} />
              <span>
                <span className="block text-[8.5px] font-bold uppercase text-[#9a8c82]">Selling</span>
                <span className="text-[10px] font-bold text-[#403730]">{titleCase(variant.sellingStatus)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
function VariantIdentity({ image, productName, label, sku }: { image: string; productName: string; label: string; sku: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative h-11 w-9 flex-none overflow-hidden rounded-lg bg-[#f1eae4]">{image ? <Image src={image} alt={`${productName} — ${label}`} fill sizes="36px" className="object-cover" /> : <Boxes className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}</span>
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
      <section className="mt-5 overflow-hidden rounded-[22px] border-0 bg-[#f3f0eb] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
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
      <div className="mb-4 flex items-center gap-3 rounded-[22px] border-0 bg-[#f3f0eb] px-4 py-3 shadow-[0_12px_32px_rgba(72,50,36,.07)]">
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
      <div className="mt-4 overflow-hidden rounded-[22px] border-0 bg-[#f3f0eb] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
        <header className="flex items-center justify-between border-b border-[#eee7e1] px-5 py-4">
          <div>
            <h3 className="text-[12px] font-extrabold text-[#302924]">{params.productId ? (detail.products.find((product) => product.id === params.productId)?.name ?? detail.name) : `${detail.name} timeline`}</h3>
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
        <nav className="mt-4 flex items-center justify-between rounded-[22px] border-0 bg-[#f3f0eb] px-4 py-3 shadow-[0_12px_32px_rgba(72,50,36,.07)]">
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
  const active = [params.productId, source, movementType, from, to].some(Boolean);
  return (
    <form action="/admin/inventory" className="rounded-[22px] border-0 bg-[#f3f0eb] p-4 shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <input type="hidden" name="view" value="activity" />
      <input type="hidden" name="brand" value={detail.slug} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(230px,1.3fr)_190px_190px_150px_150px_auto] xl:items-end">
        <Select label="Product" name="productId" value={params.productId ?? ""}>
          <option value="">All products in {detail.name}</option>
          {detail.products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
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
