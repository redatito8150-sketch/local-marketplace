import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Package,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  getAllWarehouseTransfers,
  type WarehouseTransferRow,
  type WarehouseTransferStatus,
} from "@/lib/data/warehouse";
import { DashboardEmptyState, DashboardPageHeader } from "@/components/dashboard/DashboardUI";
import AdminWorkspaceNav from "@/components/admin/AdminWorkspaceNav";
import { BrandMark, CONTROL, TonePill, formatCount } from "@/components/admin/inventory/shared";
import {
  ACTION_REQUIRED_WAREHOUSE_STATUSES,
  OPEN_WAREHOUSE_STATUSES,
  WAREHOUSE_STATUS_META,
  hasUnresolvedQuarantine,
  warehouseDocumentLabel,
} from "@/components/admin/warehouse/warehouseUi";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 12;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Params = {
  q?: string;
  status?: string;
  direction?: string;
  brand?: string;
  discrepancy?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: string;
};

function pageHref(params: Params, patch: Partial<Params>): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...patch })) {
    if (value && key !== "page") next.set(key, value);
  }
  if (patch.page && patch.page !== "1") next.set("page", patch.page);
  const query = next.toString();
  return query ? `/admin/warehouse?${query}` : "/admin/warehouse";
}

function isWarehouseStatus(value: string | undefined): value is WarehouseTransferStatus {
  return Boolean(value && value in WAREHOUSE_STATUS_META);
}

export default async function AdminWarehousePage(props: { searchParams: Promise<Params> }) {
  const params = await props.searchParams;
  const allTransfers = await getAllWarehouseTransfers();
  const q = params.q?.trim() ?? "";
  const normalizedQuery = q.toLocaleLowerCase("en-US");
  const status = params.status === "action_required" || params.status === "open" || isWarehouseStatus(params.status) ? params.status : "";
  const direction = params.direction === "to_local" || params.direction === "to_brand" ? params.direction : "";
  const brand = params.brand ?? "";
  const discrepancy = params.discrepancy === "open" || params.discrepancy === "resolved" ? params.discrepancy : "";
  const from = params.from && DATE_PATTERN.test(params.from) ? params.from : "";
  const to = params.to && DATE_PATTERN.test(params.to) ? params.to : "";
  const sort = params.sort === "oldest" || params.sort === "status" ? params.sort : "newest";
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const actionRequired = allTransfers.filter((transfer) => ACTION_REQUIRED_WAREHOUSE_STATUSES.has(transfer.status));
  const actionRequiredUnits = actionRequired.reduce(
    (sum, transfer) => sum + transfer.items.filter((item) => item.receivedOkQty == null).reduce((itemSum, item) => itemSum + item.requestedQty, 0),
    0,
  );
  const openDiscrepancies = allTransfers.filter((transfer) => transfer.items.some(hasUnresolvedQuarantine));
  const brandOptions = [...new Map(allTransfers.map((transfer) => [transfer.brandSlug, transfer.brandName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));

  const filtered = allTransfers.filter((transfer) => {
    if (status === "action_required" && !ACTION_REQUIRED_WAREHOUSE_STATUSES.has(transfer.status)) return false;
    if (status === "open" && !OPEN_WAREHOUSE_STATUSES.has(transfer.status)) return false;
    if (isWarehouseStatus(status) && transfer.status !== status) return false;
    if (direction && transfer.direction !== direction) return false;
    if (brand && transfer.brandSlug !== brand) return false;
    const hasOpenDiscrepancy = transfer.items.some(hasUnresolvedQuarantine);
    const hasResolvedDiscrepancy = transfer.items.some((item) => Boolean(item.quarantineResolvedAt));
    if (discrepancy === "open" && !hasOpenDiscrepancy) return false;
    if (discrepancy === "resolved" && !hasResolvedDiscrepancy) return false;
    const requestedAt = new Date(transfer.requestedAt).getTime();
    if (from && requestedAt < new Date(`${from}T00:00:00`).getTime()) return false;
    if (to && requestedAt > new Date(`${to}T23:59:59.999`).getTime()) return false;
    if (normalizedQuery) {
      const searchable = [
        transfer.documentNumber ?? transfer.id,
        transfer.brandName,
        transfer.status,
        warehouseDocumentLabel(transfer.direction),
        ...transfer.items.flatMap((item) => [item.productName, item.optionLabel, item.sku]),
      ].join(" ").toLocaleLowerCase("en-US");
      if (!searchable.includes(normalizedQuery)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sort === "oldest") return new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime();
    if (sort === "status") return WAREHOUSE_STATUS_META[a.status].order - WAREHOUSE_STATUS_META[b.status].order || new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
    return new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime();
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const visibleTransfers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilters = Boolean(q || status || direction || brand || discrepancy || from || to || sort !== "newest");

  return (
    <div>
      <AdminWorkspaceNav workspace="inventory" activeHref="/admin/warehouse" />
      <DashboardPageHeader
        title="Stock requests"
        description="Review, receive and resolve every Zakhnook warehouse document from one operational queue."
      />

      <section aria-label="Warehouse summary" className="mt-5 grid gap-3 md:grid-cols-3">
        <SummaryLink href="/admin/warehouse?status=action_required" label="Needs review" value={actionRequired.length} detail={`${formatCount(actionRequiredUnits)} units waiting`} icon={Clock3} urgent={actionRequired.length > 0} />
        <SummaryLink href="/admin/warehouse?status=open" label="Open documents" value={allTransfers.filter((transfer) => OPEN_WAREHOUSE_STATUSES.has(transfer.status)).length} detail="Across every warehouse stage" icon={Package} />
        <SummaryLink href="/admin/warehouse?discrepancy=open" label="Open discrepancies" value={openDiscrepancies.length} detail="Damaged or missing units to resolve" icon={AlertTriangle} urgent={openDiscrepancies.length > 0} />
      </section>

      <WarehouseFilters q={q} status={status} direction={direction} brand={brand} discrepancy={discrepancy} from={from} to={to} sort={sort} brandOptions={brandOptions} active={activeFilters} />

      <div className="mb-2 mt-4 flex items-center justify-between gap-3 px-1">
        <p className="text-[10.5px] font-semibold text-[#756960]">Showing {formatCount(visibleTransfers.length)} of {formatCount(filtered.length)} matching documents</p>
        <p className="hidden text-[10px] text-[#91837a] sm:block">{formatCount(allTransfers.length)} documents in total</p>
      </div>

      <section className="overflow-hidden rounded-[22px] border-0 bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
        {visibleTransfers.length === 0 ? (
          <DashboardEmptyState title={status === "action_required" ? "No documents need review" : "No matching documents"} description={status === "action_required" ? "Every submitted warehouse document has been reviewed." : "Clear or adjust the filters to see more warehouse documents."} />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(240px,1.35fr)_minmax(170px,1fr)_110px_110px_150px_24px] items-center gap-4 border-b border-[#ddd4cc] px-5 py-3 text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960] lg:grid">
              <span>Document</span><span>Brand</span><span>Variants / units</span><span>Status</span><span>Requested</span><span />
            </div>
            <div className="divide-y divide-[#ddd4cc]">{visibleTransfers.map((transfer) => <TransferRow key={transfer.id} transfer={transfer} />)}</div>
            <Pager page={page} pageCount={pageCount} params={params} />
          </>
        )}
      </section>
    </div>
  );
}

function SummaryLink({ href, label, value, detail, icon: Icon, urgent = false }: { href: string; label: string; value: number; detail: string; icon: React.ElementType; urgent?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-[20px] bg-[#ece7e0] p-4 shadow-[0_12px_32px_rgba(72,50,36,.07)] transition-colors hover:bg-[#e4ded6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/30">
      <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-xl ${urgent ? "bg-red-50 text-red-700" : "bg-[#e2dcd4] text-[#5b5049]"}`}><Icon className="h-[18px] w-[18px]" /></span>
      <span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-[#756960]">{label}</span><span className="mt-0.5 block text-[18px] font-extrabold tabular-nums text-[#302924]">{formatCount(value)}</span><span className="mt-0.5 block truncate text-[9.5px] text-[#8d8076]">{detail}</span></span>
      <ChevronRight className="ml-auto h-4 w-4 text-[#a2948a] transition-transform group-hover:translate-x-0.5 group-hover:text-[#C85956]" />
    </Link>
  );
}

function WarehouseFilters(props: { q: string; status: string; direction: string; brand: string; discrepancy: string; from: string; to: string; sort: string; brandOptions: [string, string][]; active: boolean }) {
  const advancedActive = Boolean(props.direction || props.discrepancy || props.from || props.to || props.sort !== "newest");
  return (
    <form action="/admin/warehouse" className="mt-4 rounded-[20px] bg-[#e6e0d8] p-2.5">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_190px_220px_auto]">
        <label className="relative min-w-0 md:col-span-2 xl:col-span-1"><span className="sr-only">Search warehouse documents</span><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9b8d83]" /><input name="q" defaultValue={props.q} autoComplete="off" placeholder="Document, brand, product or SKU" className={`${CONTROL} w-full pl-9`} /></label>
        <label><span className="sr-only">Document status</span><select name="status" defaultValue={props.status} className={`${CONTROL} w-full`}><option value="">All statuses</option><option value="action_required">Needs review</option><option value="open">All open stages</option>{Object.entries(WAREHOUSE_STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></label>
        <label><span className="sr-only">Partner brand</span><select name="brand" defaultValue={props.brand} className={`${CONTROL} w-full`}><option value="">All partner brands</option>{props.brandOptions.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select></label>
        <div className="flex h-11 items-center gap-2 xl:justify-end"><button className="h-11 rounded-xl bg-[#C85956] px-5 text-[11px] font-bold text-white hover:bg-[#b84e4b]">Apply</button>{props.active ? <Link href="/admin/warehouse" className="px-1 text-[10px] font-bold text-[#75685f] hover:text-[#C85956]">Clear</Link> : null}</div>
      </div>
      <details className="group/filters mt-2 border-t border-[#d5cbc2] pt-2" open={advancedActive || undefined}>
        <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg px-1 py-1 text-[10.5px] font-bold text-[#665a52] outline-none hover:text-[#C85956] focus-visible:ring-2 focus-visible:ring-[#C85956]/25 [&::-webkit-details-marker]:hidden"><SlidersHorizontal className="h-3.5 w-3.5" /> More filters{advancedActive ? <span className="rounded-full bg-[#f2dedd] px-2 py-0.5 text-[9px] text-[#A94442]">Active</span> : null}</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <label><span className="sr-only">Document direction</span><select name="direction" defaultValue={props.direction} className={`${CONTROL} w-full`}><option value="">Restock and returns</option><option value="to_local">Restock only</option><option value="to_brand">Returns only</option></select></label>
          <label><span className="sr-only">Discrepancy status</span><select name="discrepancy" defaultValue={props.discrepancy} className={`${CONTROL} w-full`}><option value="">Any discrepancy status</option><option value="open">Open discrepancies</option><option value="resolved">Resolved discrepancies</option></select></label>
          <label><span className="sr-only">Requested from</span><input name="from" type="date" defaultValue={props.from} className={`${CONTROL} w-full`} /></label>
          <label><span className="sr-only">Requested to</span><input name="to" type="date" defaultValue={props.to} className={`${CONTROL} w-full`} /></label>
          <label><span className="sr-only">Sort documents</span><select name="sort" defaultValue={props.sort} className={`${CONTROL} w-full`}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="status">Workflow stage</option></select></label>
        </div>
      </details>
    </form>
  );
}

function TransferRow({ transfer }: { transfer: WarehouseTransferRow }) {
  const meta = WAREHOUSE_STATUS_META[transfer.status];
  const isReturn = transfer.direction === "to_brand";
  const DirectionIcon = isReturn ? ArrowUpRight : ArrowDownLeft;
  const totalRequested = transfer.items.reduce((sum, item) => sum + item.requestedQty, 0);
  const unresolved = transfer.items.filter(hasUnresolvedQuarantine);
  const documentNumber = transfer.documentNumber ?? `Legacy · ${transfer.id.slice(0, 8).toUpperCase()}`;
  return (
    <Link href={`/admin/warehouse/${transfer.id}`} className="group grid gap-3 px-5 py-4 transition-colors hover:bg-[#e4ded6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 lg:grid-cols-[minmax(240px,1.35fr)_minmax(170px,1fr)_110px_110px_150px_24px] lg:items-center lg:gap-4">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[9.5px] font-bold ${isReturn ? "bg-[#f1e4dd] text-[#9a4a3c]" : "bg-[#e2ecdf] text-[#3f6b4a]"}`}><DirectionIcon className="h-3 w-3" />{isReturn ? "Return" : "Restock"}</span>{unresolved.length > 0 ? <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-amber-800"><AlertTriangle className="h-3 w-3" />{unresolved.length} unresolved</span> : null}</div><p className="mt-1.5 truncate text-[12px] font-extrabold text-[#302924]">{documentNumber}</p><p className="mt-1 truncate text-[9.5px] text-[#8d8076]">{warehouseDocumentLabel(transfer.direction)}</p></div>
      <div className="flex min-w-0 items-center gap-3"><BrandMark brand={{ name: transfer.brandName, logoImage: transfer.brandLogoImage }} /><div className="min-w-0"><p className="truncate text-[12px] font-extrabold text-[#302924]">{transfer.brandName}</p><p className="mt-1 truncate text-[9.5px] text-[#8d8076]">/{transfer.brandSlug}</p></div></div>
      <div><p className="text-[12px] font-extrabold tabular-nums text-[#302924]">{formatCount(transfer.items.length)} / {formatCount(totalRequested)}</p><p className="mt-1 text-[9px] text-[#8d8076]">variants / units</p></div>
      <TonePill label={meta.shortLabel} tone={meta.tone} icon={meta.icon} />
      <div><p className="text-[10.5px] font-semibold text-[#5b5049]">{formatDateTime(transfer.requestedAt)}</p><p className="mt-1 text-[9px] text-[#8d8076]">Updated {formatDateTime(transfer.updatedAt)}</p></div>
      <ChevronRight className="h-4 w-4 text-[#a2948a] transition-transform group-hover:translate-x-0.5 group-hover:text-[#C85956]" />
    </Link>
  );
}

function Pager({ page, pageCount, params }: { page: number; pageCount: number; params: Params }) {
  if (pageCount <= 1) return null;
  return <nav aria-label="Warehouse document pages" className="flex items-center justify-between border-t border-[#ddd4cc] px-5 py-3"><p className="text-[10px] text-[#756960]">Page <strong className="text-[#403730]">{page}</strong> of {pageCount}</p><div className="flex gap-2"><Link aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} href={pageHref(params, { page: String(page - 1) })} className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[10px] font-bold ${page <= 1 ? "pointer-events-none bg-[#e2dcd4] text-[#a2948a]" : "bg-[#e2dcd4] text-[#5b5049] hover:bg-[#d8d0c8]"}`}><ChevronLeft className="h-3 w-3" />Previous</Link><Link aria-disabled={page >= pageCount} tabIndex={page >= pageCount ? -1 : undefined} href={pageHref(params, { page: String(page + 1) })} className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[10px] font-bold ${page >= pageCount ? "pointer-events-none bg-[#e2dcd4] text-[#a2948a]" : "bg-[#242424] text-white hover:bg-[#3a332e]"}`}>Next<ChevronRight className="h-3 w-3" /></Link></div></nav>;
}
