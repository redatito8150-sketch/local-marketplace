import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  getAllWarehouseTransfers,
  type WarehouseTransferRow,
  type WarehouseTransferStatus,
} from "@/lib/data/warehouse";
import { DashboardEmptyState } from "@/components/dashboard/DashboardUI";
import WarehouseQueueFilters from "@/components/admin/warehouse/WarehouseQueueFilters";
import { BrandMark, formatCount } from "@/components/admin/inventory/shared";
import {
  ACTION_REQUIRED_WAREHOUSE_STATUSES,
  WAREHOUSE_STATUS_META,
  hasPendingBrandDeliveryNoteReview,
  warehouseDocumentLabel,
  warehouseStatusMeta,
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

function hasOpenWarehouseIssue(transfer: WarehouseTransferRow): boolean {
  return transfer.reconciliationStatus === "open_discrepancy" || transfer.reconciliationStatus === "partially_settled";
}

export default async function AdminWarehousePage(props: { searchParams: Promise<Params> }) {
  const params = await props.searchParams;
  const allTransfers = await getAllWarehouseTransfers();
  const q = params.q?.trim() ?? "";
  const normalizedQuery = q.toLocaleLowerCase("en-US");
  const status = params.status === "action_required" || params.status === "requested" || isWarehouseStatus(params.status) ? params.status : "";
  const direction = params.direction === "to_local" || params.direction === "to_brand" ? params.direction : "";
  const brand = params.brand ?? "";
  const discrepancy = params.discrepancy === "open" || params.discrepancy === "resolved" ? params.discrepancy : "";
  const from = params.from && DATE_PATTERN.test(params.from) ? params.from : "";
  const to = params.to && DATE_PATTERN.test(params.to) ? params.to : "";
  const sort = ["document-asc", "document-desc", "requested-asc", "requested-desc", "status-asc", "status-desc", "date-asc", "date-desc"].includes(params.sort ?? "")
    ? params.sort!
    : params.sort === "oldest"
      ? "date-asc"
      : params.sort === "status"
        ? "status-asc"
        : "date-desc";
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const needsReviewCount = allTransfers.filter((transfer) =>
    ACTION_REQUIRED_WAREHOUSE_STATUSES.has(transfer.status)
      || hasOpenWarehouseIssue(transfer)
      || hasPendingBrandDeliveryNoteReview(transfer)
  ).length;
  const statusCounts = {
    "": allTransfers.length,
    requested: allTransfers.filter((transfer) => ["pending", "submitted"].includes(transfer.status)).length,
    approved: allTransfers.filter((transfer) => transfer.status === "approved").length,
    in_transit: allTransfers.filter((transfer) => transfer.status === "in_transit").length,
    action_required: needsReviewCount,
    received: allTransfers.filter((transfer) => transfer.status === "received").length,
  };
  const brandOptions = [...new Map(allTransfers.map((transfer) => [transfer.brandSlug, transfer.brandName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));

  const filtered = allTransfers.filter((transfer) => {
    const hasOpenDiscrepancy = hasOpenWarehouseIssue(transfer);
    const hasPendingBrandNote = hasPendingBrandDeliveryNoteReview(transfer);
    if (status === "action_required" && !ACTION_REQUIRED_WAREHOUSE_STATUSES.has(transfer.status) && !hasOpenDiscrepancy && !hasPendingBrandNote) return false;
    if (status === "requested" && !["pending", "submitted"].includes(transfer.status)) return false;
    if (isWarehouseStatus(status) && transfer.status !== status) return false;
    if (direction && transfer.direction !== direction) return false;
    if (brand && transfer.brandSlug !== brand) return false;
    const hasResolvedDiscrepancy = transfer.reconciliationStatus === "settled" || transfer.reconciliationStatus === "corrected" || transfer.items.some((item) => Boolean(item.quarantineResolvedAt));
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
        transfer.receivingNote ?? "",
        ...transfer.items.flatMap((item) => [item.productName, item.optionLabel, item.sku]),
      ].join(" ").toLocaleLowerCase("en-US");
      if (!searchable.includes(normalizedQuery)) return false;
    }
    return true;
  }).sort((a, b) => {
    const direction = sort.endsWith("-desc") ? -1 : 1;
    if (sort.startsWith("document-")) return direction * (a.documentNumber ?? a.id).localeCompare(b.documentNumber ?? b.id);
    if (sort.startsWith("requested-")) {
      const units = (row: WarehouseTransferRow) => row.items.reduce((sum, item) => sum + item.requestedQty, 0);
      return direction * (units(a) - units(b));
    }
    if (sort.startsWith("status-")) return direction * (WAREHOUSE_STATUS_META[a.status].order - WAREHOUSE_STATUS_META[b.status].order);
    return direction * (new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime());
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const visibleTransfers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <div>
      <header>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <h1 className="text-[25px] font-extrabold tracking-[-0.035em] text-[#242424]">Stock requests</h1>
          <span className="text-[11px] font-semibold text-[#81746b]">{formatCount(allTransfers.length)} documents</span>
        </div>
        <p className="mt-2 text-[11.5px] leading-5 text-[#756960]">Review and resolve incoming warehouse stock requests.</p>
      </header>

      <div className="mt-5">
        <WarehouseQueueFilters key={`${q}-${status}-${brand}-${from}-${to}`} q={q} status={status} brand={brand} from={from} to={to} brandOptions={brandOptions} statusCounts={statusCounts} />
      </div>
      <section className="mt-4 overflow-hidden rounded-[20px] border border-[#e6ded7] bg-white shadow-[0_10px_32px_rgba(72,50,36,.045)]">
        {visibleTransfers.length === 0 ? (
          <DashboardEmptyState title={status === "action_required" ? "No documents need review" : "No matching documents"} description={status === "action_required" ? "Every submitted warehouse document has been reviewed." : "Clear or adjust the filters to see more warehouse documents."} />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(260px,1.3fr)_150px_minmax(190px,.8fr)_230px_20px] items-center gap-4 border-b border-[#e4ddd7] bg-[#fcfaf8] px-5 py-2 text-[9px] font-bold uppercase tracking-[0.09em] text-[#756960] lg:grid">
              <WarehouseSortHeader label="Document / brand" column="document" sort={sort} href={pageHref(params, { sort: nextSort(sort, "document"), page: undefined })} />
              <WarehouseSortHeader label="Requested" note="variants / units" column="requested" sort={sort} href={pageHref(params, { sort: nextSort(sort, "requested"), page: undefined })} />
              <WarehouseSortHeader label="Status" column="status" sort={sort} href={pageHref(params, { sort: nextSort(sort, "status"), page: undefined })} />
              <WarehouseSortHeader label="Dates" column="date" sort={sort} href={pageHref(params, { sort: nextSort(sort, "date"), page: undefined })} />
              <span />
            </div>
            <div className="divide-y divide-[#e8e1db]">{visibleTransfers.map((transfer) => <TransferRow key={transfer.id} transfer={transfer} />)}</div>
            <div className="border-t border-[#e8e1db] px-4 py-3 text-[9.5px] text-[#8d8076] sm:px-5">Showing {formatCount(visibleTransfers.length)} of {formatCount(filtered.length)} matching documents</div>
            <Pager page={page} pageCount={pageCount} params={params} />
          </>
        )}
      </section>
    </div>
  );
}

function nextSort(current: string, column: string) {
  if (current === `${column}-asc`) return `${column}-desc`;
  if (current === `${column}-desc`) return `${column}-asc`;
  return column === "date" || column === "requested" ? `${column}-desc` : `${column}-asc`;
}

function WarehouseSortHeader({ label, note, column, sort, href }: { label: string; note?: string; column: string; sort: string; href: string }) {
  const active = sort.startsWith(`${column}-`);
  const Icon = active ? (sort.endsWith("-asc") ? ArrowUp : ArrowDown) : ArrowUpDown;
  return <Link href={href} scroll={false} className={`group inline-flex min-h-9 items-center gap-1.5 rounded-lg px-1.5 outline-none transition-colors hover:text-[#A94442] focus-visible:ring-2 focus-visible:ring-[#C85956]/25 ${active ? "text-[#A94442]" : ""}`}><span>{label}{note ? <small className="mt-0.5 block text-[8px] font-medium normal-case tracking-normal text-[#9a8d83]">{note}</small> : null}</span><Icon className="h-3 w-3 flex-none opacity-60 transition-opacity group-hover:opacity-100" aria-hidden="true" /></Link>;
}

function TransferRow({ transfer }: { transfer: WarehouseTransferRow }) {
  const meta = warehouseStatusMeta(transfer.status, transfer.direction);
  const totalRequested = transfer.items.reduce((sum, item) => sum + item.requestedQty, 0);
  const pendingBrandNote = hasPendingBrandDeliveryNoteReview(transfer);
  const needsReview = hasOpenWarehouseIssue(transfer) || pendingBrandNote;
  const documentNumber = transfer.documentNumber ?? `Legacy · ${transfer.id.slice(0, 8).toUpperCase()}`;
  const tone = needsReview ? "red" : meta.tone;
  const StatusIcon = needsReview ? AlertTriangle : meta.icon;
  const statusLabel = needsReview ? "Needs review" : meta.shortLabel;
  const railClass = tone === "amber" ? "bg-amber-400" : tone === "emerald" ? "bg-emerald-500" : tone === "red" ? "bg-red-500" : tone === "blue" ? "bg-sky-500" : tone === "violet" ? "bg-violet-500" : "bg-stone-400";
  const statusClass = tone === "amber" ? "text-amber-800" : tone === "emerald" ? "text-emerald-800" : tone === "red" ? "text-red-700" : tone === "blue" ? "text-sky-800" : tone === "violet" ? "text-violet-800" : "text-stone-600";
  return (
    <Link href={`/admin/warehouse/${transfer.id}`} className="group relative grid gap-3 px-4 py-4 transition-colors hover:bg-[#fdfbf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 sm:px-5 lg:grid-cols-[minmax(260px,1.3fr)_150px_minmax(190px,.8fr)_230px_20px] lg:items-center lg:gap-4">
      <span aria-hidden="true" className={`absolute bottom-0 left-0 top-0 w-[3px] ${railClass}`} />
      <div className="flex min-w-0 items-center gap-3"><BrandMark brand={{ name: transfer.brandName, logoImage: transfer.brandLogoImage }} /><div className="min-w-0"><p className="truncate text-[12px] font-extrabold text-[#302924]">{documentNumber}</p><p className="mt-1 truncate text-[10px] font-medium text-[#81746b]">{transfer.brandName}</p></div></div>
      <div><p className="text-[12px] font-extrabold tabular-nums text-[#302924]">{formatCount(transfer.items.length)} / {formatCount(totalRequested)}</p><p className="mt-1 text-[9px] text-[#8d8076]">variants / units</p></div>
      <div className="flex flex-col items-start gap-0.5">
        <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-extrabold ${statusClass}`}><StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />{statusLabel}</span>
        {transfer.status === "received" && transfer.reconciliationStatus === "corrected" ? (
          <span className="pl-5 text-[8.5px] font-bold tracking-[0.02em] text-[#7b6f66]">Corrected</span>
        ) : pendingBrandNote ? (
          <span className="pl-5 text-[8.5px] font-bold tracking-[0.02em] text-red-600">Brand note</span>
        ) : null}
      </div>
      <div><p className="text-[10.5px] font-semibold text-[#4f453e]"><span className="font-extrabold">Created</span> {formatDateTime(transfer.requestedAt)}</p><p className="mt-1 text-[9.5px] text-[#8d8076]">Updated {formatDateTime(transfer.updatedAt)}</p></div>
      <ChevronRight className="h-4 w-4 text-[#a2948a] transition-transform group-hover:translate-x-0.5 group-hover:text-[#C85956]" />
    </Link>
  );
}

function Pager({ page, pageCount, params }: { page: number; pageCount: number; params: Params }) {
  if (pageCount <= 1) return null;
  return <nav aria-label="Warehouse document pages" className="flex items-center justify-between border-t border-[#ddd4cc] px-5 py-3"><p className="text-[10px] text-[#756960]">Page <strong className="text-[#403730]">{page}</strong> of {pageCount}</p><div className="flex gap-2"><Link aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} href={pageHref(params, { page: String(page - 1) })} className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[10px] font-bold ${page <= 1 ? "pointer-events-none bg-[#e2dcd4] text-[#a2948a]" : "bg-[#e2dcd4] text-[#5b5049] hover:bg-[#d8d0c8]"}`}><ChevronLeft className="h-3 w-3" />Previous</Link><Link aria-disabled={page >= pageCount} tabIndex={page >= pageCount ? -1 : undefined} href={pageHref(params, { page: String(page + 1) })} className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[10px] font-bold ${page >= pageCount ? "pointer-events-none bg-[#e2dcd4] text-[#a2948a]" : "bg-[#242424] text-white hover:bg-[#3a332e]"}`}>Next<ChevronRight className="h-3 w-3" /></Link></div></nav>;
}
