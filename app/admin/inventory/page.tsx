import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  Search,
  Truck,
} from "lucide-react";
import AdminWorkspaceNav from "@/components/admin/AdminWorkspaceNav";
import { DashboardEmptyState, DashboardPageHeader, dashboardButtonPrimary, dashboardButtonSecondary } from "@/components/dashboard/DashboardUI";
import { getInventoryMovementsForAdmin, getInventoryOverviewForAdmin } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 30;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FILTER_CONTROL = "h-11 min-w-0 rounded-xl border border-[#e7ddd5] bg-white px-3 text-[12.5px] text-[#51473f] outline-none transition-[border-color,box-shadow] focus-visible:border-[#C85956]/50 focus-visible:ring-4 focus-visible:ring-[#C85956]/8";

const SOURCE_OPTIONS = [
  { value: "admin", label: "Admin adjustment" },
  { value: "brand_portal", label: "Brand adjustment" },
  { value: "order", label: "Customer order" },
  { value: "order_cancellation", label: "Order cancellation" },
  { value: "warehouse_transfer", label: "Warehouse transfer" },
  { value: "warehouse_correction", label: "Warehouse correction" },
  { value: "product_editor", label: "Product setup" },
  { value: "migration", label: "Historical migration" },
] as const;

const MOVEMENT_OPTIONS = [
  { value: "opening_balance", label: "Opening balance" },
  { value: "manual_adjustment", label: "Manual adjustment" },
  { value: "admin_correction", label: "Admin correction" },
  { value: "order_placed", label: "Order placed" },
  { value: "order_cancelled", label: "Order cancelled" },
  { value: "return_restocked", label: "Return restocked" },
  { value: "warehouse_transfer_received", label: "Warehouse received" },
  { value: "warehouse_transfer_shipped", label: "Warehouse shipped" },
] as const;

type InventoryParams = {
  q?: string;
  brand?: string;
  source?: string;
  movement?: string;
  from?: string;
  to?: string;
  productId?: string;
  page?: string;
};

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function sourceLabel(value: string) {
  return SOURCE_OPTIONS.find((option) => option.value === value)?.label ?? titleCase(value);
}

export default async function AdminInventoryPage(props: { searchParams: Promise<InventoryParams> }) {
  const params = await props.searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const source = SOURCE_OPTIONS.some((option) => option.value === params.source) ? params.source : undefined;
  const movementType = MOVEMENT_OPTIONS.some((option) => option.value === params.movement) ? params.movement : undefined;
  const from = params.from && DATE_PATTERN.test(params.from) ? params.from : undefined;
  const to = params.to && DATE_PATTERN.test(params.to) ? params.to : undefined;

  const [overview, result] = await Promise.all([
    getInventoryOverviewForAdmin(),
    getInventoryMovementsForAdmin({
      productId: params.productId?.trim() || undefined,
      q: params.q?.trim() || undefined,
      brand: params.brand?.trim() || undefined,
      source,
      movementType,
      from,
      to,
      page,
      limit: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const activeFilterCount = [params.q, params.brand, source, movementType, from, to, params.productId].filter(Boolean).length;

  function pageHref(target: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    return `/admin/inventory${search.size ? `?${search}` : ""}`;
  }

  const health = [
    { label: "All variants", value: overview.totalVariantCount, note: `${overview.totalAvailableUnits.toLocaleString()} units available`, href: "/admin/products", tone: "bg-[#C85956]", active: true },
    { label: "Healthy", value: overview.healthyCount, note: "Above the alert level", href: "/admin/products?inventory=in", tone: "bg-emerald-500", active: false },
    { label: "Low stock", value: overview.lowStockCount, note: "Needs a replenishment plan", href: "/admin/low-stock?level=low", tone: "bg-amber-500", active: false },
    { label: "Out of stock", value: overview.outOfStockCount, note: "Unavailable to shoppers", href: "/admin/low-stock?level=out", tone: "bg-red-500", active: false },
  ];

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Marketplace inventory"
        title="Inventory"
        description={params.productId
          ? "Every immutable stock movement recorded for this product."
          : "Monitor stock across every brand, catch risks early, and keep a complete audit trail of every unit that moves."}
        actions={<><Link href="/admin/low-stock" className={dashboardButtonSecondary}>Review low stock</Link><Link href="/admin/warehouse" className={dashboardButtonPrimary}><Truck aria-hidden="true" className="mr-2 h-4 w-4" />Open warehouse</Link></>}
      />

      <div className="mt-6"><AdminWorkspaceNav workspace="inventory" activeHref="/admin/inventory" /></div>

      <section aria-label="Inventory health" className="overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white shadow-[0_10px_32px_rgba(72,50,36,.04)]">
        <div className="grid grid-cols-2 xl:grid-cols-4">
          {health.map((item) => (
            <Link key={item.label} href={item.href} className={`group relative min-h-[112px] border-b border-r border-[#eee7e1] px-4 py-4 transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/30 [&:nth-child(2n)]:border-r-0 [&:nth-child(n+3)]:border-b-0 xl:border-b-0 xl:px-5 xl:[&:nth-child(2n)]:border-r xl:last:border-r-0 ${item.active ? "bg-[#fff8f6]" : "hover:bg-[#fcfaf8]"}`}>
              <span className={`absolute inset-y-4 left-0 w-[3px] rounded-r-full ${item.tone} ${item.active ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-40"}`} aria-hidden="true" />
              <div className="flex items-start justify-between gap-4"><div><p className={`text-[10.5px] font-bold uppercase tracking-[0.1em] ${item.active ? "text-[#C85956]" : "text-[#8d8076]"}`}>{item.label}</p><p className="mt-1 text-[27px] font-extrabold tabular-nums tracking-[-0.04em] text-[#242424]">{item.value.toLocaleString()}</p></div><span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.tone}`} aria-hidden="true" /></div>
              <p className="mt-1 text-[10.5px] text-[#91837a]">{item.note}</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Inventory operations" className="mt-4 grid overflow-hidden rounded-[18px] border border-[#eadfd7] bg-[#fcfaf8] sm:grid-cols-3">
        <OperationalSignal icon={Truck} label="Incoming stock" value={`${overview.incomingUnitCount.toLocaleString()} units`} note={`${overview.openTransferCount} open warehouse ${overview.openTransferCount === 1 ? "document" : "documents"}`} href="/admin/warehouse" />
        <OperationalSignal icon={Activity} label="Recent activity" value={`${overview.movementsLast24Hours.toLocaleString()} movements`} note="Recorded in the last 24 hours" />
        <OperationalSignal icon={PackageSearch} label="Catalog coverage" value={`${overview.brands.length.toLocaleString()} brands`} note={`${overview.totalVariantCount.toLocaleString()} active variants monitored`} href="/admin/products" />
      </section>

      <form action="/admin/inventory" className="mt-5 rounded-[18px] border border-[#eadfd7] bg-white p-4 shadow-[0_8px_24px_rgba(72,50,36,.035)]">
        {params.productId ? <input type="hidden" name="productId" value={params.productId} /> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.3fr)_180px_180px_180px_145px_145px_auto] xl:items-end">
          <label className="min-w-0"><span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">Search activity</span><span className="relative mt-1.5 block"><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a2948a]" /><input name="q" defaultValue={params.q ?? ""} autoComplete="off" placeholder="Product, brand or SKU…" className={`${FILTER_CONTROL} w-full pl-10`} /></span></label>
          <FilterSelect label="Brand" name="brand" value={params.brand ?? ""}><option value="">All brands</option>{overview.brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</FilterSelect>
          <FilterSelect label="Source" name="source" value={source ?? ""}><option value="">All sources</option>{SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</FilterSelect>
          <FilterSelect label="Movement" name="movement" value={movementType ?? ""}><option value="">All movements</option>{MOVEMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</FilterSelect>
          <FilterDate label="From" name="from" value={from ?? ""} />
          <FilterDate label="To" name="to" value={to ?? ""} />
          <div className="flex h-11 items-center gap-2"><button type="submit" className="h-11 rounded-xl bg-[#C85956] px-5 text-[12px] font-bold text-white transition-colors hover:bg-[#b84e4b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/20">Apply</button>{activeFilterCount > 0 ? <Link href="/admin/inventory" className="inline-flex h-11 items-center px-1 text-[11px] font-bold text-[#8d8076] hover:text-[#C85956]">Clear</Link> : null}</div>
        </div>
      </form>

      <section className="mt-4 overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white shadow-[0_10px_34px_rgba(72,50,36,.04)]">
        <header className="flex flex-col gap-2 border-b border-[#eee7e1] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 className="text-[12px] font-extrabold text-[#302924]">Inventory activity</h2><p className="mt-1 text-[10.5px] text-[#8d8076]">{result.total.toLocaleString()} immutable {result.total === 1 ? "movement" : "movements"}{activeFilterCount ? " match these filters" : " across the marketplace"}.</p></div><div className="flex items-center gap-2 text-[9.5px] font-bold text-[#8d8076]"><span className="inline-flex items-center gap-1.5"><ArrowDownLeft aria-hidden="true" className="h-3.5 w-3.5 text-emerald-700" />Stock in</span><span className="inline-flex items-center gap-1.5"><ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5 text-red-700" />Stock out</span></div></header>

        {result.rows.length ? <ActivityRows rows={result.rows} /> : <DashboardEmptyState title="No inventory activity found" description={activeFilterCount ? "Clear or adjust the filters to find more stock movements." : "Stock movements will appear here after the first inventory change."} />}
      </section>

      {totalPages > 1 ? <nav aria-label="Inventory activity pages" className="mt-4 flex items-center justify-between rounded-2xl border border-[#eadfd7] bg-white px-4 py-3"><span>{page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#e4d9d1] px-3 text-[10.5px] font-bold text-[#5d5148] hover:border-[#C85956]/30 hover:text-[#C85956]"><ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />Previous</Link> : null}</span><p className="text-[10.5px] tabular-nums text-[#8d8076]">Page <strong className="text-[#51473f]">{page}</strong> of <strong className="text-[#51473f]">{totalPages}</strong></p><span>{page < totalPages ? <Link href={pageHref(page + 1)} className="inline-flex h-9 items-center gap-1 rounded-xl bg-[#242424] px-3 text-[10.5px] font-bold text-white hover:bg-[#3a332e]">Next<ChevronRight aria-hidden="true" className="h-3.5 w-3.5" /></Link> : null}</span></nav> : null}
    </div>
  );
}

function ActivityRows({ rows }: { rows: Awaited<ReturnType<typeof getInventoryMovementsForAdmin>>["rows"] }) {
  return <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] text-left text-[12px]"><thead className="border-b border-[#eee7e1] bg-[#fcfaf8] text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]"><tr><th className="px-5 py-3">Product</th><th>Change</th><th>Before / after</th><th>Reason</th><th>Source</th><th className="pr-5 text-right">Recorded</th></tr></thead><tbody className="divide-y divide-[#f0e9e3]">{rows.map((row) => <tr key={row.id} className="align-top transition-colors hover:bg-[#fdfbf9]"><td className="px-5 py-3.5"><div className="flex items-center gap-3"><span className="relative block h-12 w-10 flex-none overflow-hidden rounded-xl bg-[#f3ede7]">{row.productImage ? <Image src={row.productImage} alt={row.productName} fill sizes="40px" className="object-cover" /> : <Boxes aria-hidden="true" className="absolute inset-0 m-auto h-4 w-4 text-[#b2a49a]" />}</span><div className="min-w-0"><Link href={`/admin/products/${row.productId}/edit`} className="font-bold text-[#403730] hover:text-[#C85956] hover:underline">{row.productName}</Link><p className="mt-1 text-[9.5px] text-[#8d8076]">{row.brandName} · <code>{row.variantSku}</code></p></div></div></td><td className="py-3.5"><span className={`inline-flex items-center gap-1 font-extrabold tabular-nums ${row.quantityDelta > 0 ? "text-emerald-700" : row.quantityDelta < 0 ? "text-red-700" : "text-[#756960]"}`}>{row.quantityDelta > 0 ? <ArrowDownLeft aria-hidden="true" className="h-3.5 w-3.5" /> : row.quantityDelta < 0 ? <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /> : null}{row.quantityDelta > 0 ? "+" : ""}{row.quantityDelta}</span><p className="mt-1 text-[9px] text-[#94867c]">{titleCase(row.movementType)}</p></td><td className="py-3.5 font-bold tabular-nums text-[#51473f]">{row.previousQuantity} → {row.newQuantity}</td><td className="max-w-[280px] py-3.5 pr-4"><p className="font-semibold text-[#51473f]">{row.reason}</p>{row.note ? <p className="mt-1 truncate text-[10px] text-[#8d8076]">{row.note}</p> : null}</td><td className="py-3.5"><span className="rounded-md bg-[#f3eee9] px-2 py-1 text-[9.5px] font-bold text-[#756960]">{sourceLabel(row.source)}</span></td><td className="whitespace-nowrap py-3.5 pr-5 text-right text-[10px] text-[#8d8076]">{formatDateTime(row.createdAt)}</td></tr>)}</tbody></table></div><div className="divide-y divide-[#eee7e1] md:hidden">{rows.map((row) => <article key={row.id} className="px-4 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-bold text-[#403730]">{row.productName}</p><p className="mt-1 truncate text-[9.5px] text-[#8d8076]">{row.brandName} · {row.variantSku}</p></div><span className={`text-[13px] font-extrabold tabular-nums ${row.quantityDelta > 0 ? "text-emerald-700" : row.quantityDelta < 0 ? "text-red-700" : "text-[#756960]"}`}>{row.quantityDelta > 0 ? "+" : ""}{row.quantityDelta}</span></div><div className="mt-3 flex items-center justify-between gap-3 text-[10px]"><p className="font-semibold text-[#51473f]">{row.reason}</p><p className="tabular-nums text-[#8d8076]">{row.previousQuantity} → {row.newQuantity}</p></div><div className="mt-2 flex items-center justify-between gap-3 text-[9.5px] text-[#94867c]"><span>{sourceLabel(row.source)}</span><span>{formatDateTime(row.createdAt)}</span></div></article>)}</div></>;
}

function OperationalSignal({ icon: Icon, label, value, note, href }: { icon: React.ElementType; label: string; value: string; note: string; href?: string }) {
  const content = <><span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white text-[#C85956] shadow-[0_1px_5px_rgba(72,50,36,.07)]"><Icon aria-hidden="true" className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">{label}</span><span className="mt-0.5 block text-[13px] font-extrabold tabular-nums text-[#403730]">{value}</span><span className="mt-0.5 block text-[9.5px] text-[#94867c]">{note}</span></span>{href ? <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 text-[#b6aaa1]" /> : null}</>;
  const className = "flex min-h-[86px] items-center gap-3 border-b border-[#eee7e1] px-4 py-3 transition-colors last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:hover:bg-white";
  return href ? <Link href={href} className={`${className} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/30`}>{content}</Link> : <div className={className}>{content}</div>;
}

function FilterSelect({ label, name, value, children }: { label: string; name: string; value: string; children: React.ReactNode }) {
  return <label><span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">{label}</span><select name={name} defaultValue={value} className={`${FILTER_CONTROL} mt-1.5 w-full`}>{children}</select></label>;
}

function FilterDate({ label, name, value }: { label: string; name: string; value: string }) {
  return <label><span className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">{label}</span><input type="date" name={name} defaultValue={value} className={`${FILTER_CONTROL} mt-1.5 w-full`} /></label>;
}
