import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  FileText,
  PackageSearch,
} from "lucide-react";
import {
  getWarehouseReceiptVariantOptions,
  getWarehouseTransferById,
  type WarehouseReceiptRow,
  type WarehouseReceiptVariantOption,
  type WarehouseTransferRow,
} from "@/lib/data/warehouse";
import { getAuditLogsForEntity } from "@/lib/data/admin";
import { formatDateTime } from "@/lib/format";
import AdminWorkspaceNav from "@/components/admin/AdminWorkspaceNav";
import TransferReceiveForm from "@/components/admin/warehouse/TransferReceiveForm";
import WarehouseDocumentActions from "@/components/admin/warehouse/WarehouseDocumentActions";
import QuarantineResolutionForm from "@/components/admin/warehouse/QuarantineResolutionForm";
import PrintWarehouseDocumentButton from "@/components/admin/warehouse/PrintWarehouseDocumentButton";
import WarehouseCorrectionWorkspace from "@/components/admin/warehouse/WarehouseCorrectionWorkspace";
import { BrandMark, TonePill, VariantIdentity, formatCount, titleCase } from "@/components/admin/inventory/shared";
import {
  WAREHOUSE_STATUS_META,
  discrepancyUnits,
  hasUnresolvedQuarantine,
  warehouseDocumentLabel,
} from "@/components/admin/warehouse/warehouseUi";

const RECEIVABLE_STATUSES = new Set<WarehouseTransferRow["status"]>(["pending", "submitted", "approved", "in_transit", "partially_received"]);

export default async function AdminWarehouseTransferPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const transfer = await getWarehouseTransferById(params.id);
  if (!transfer) notFound();
  const [auditLogs, variantOptions] = await Promise.all([
    getAuditLogsForEntity("warehouse_transfer", params.id),
    getWarehouseReceiptVariantOptions(transfer.brandId),
  ]);

  const isReturn = transfer.direction === "to_brand";
  const statusMeta = WAREHOUSE_STATUS_META[transfer.status];
  const unreconciledItems = transfer.items.filter((item) => item.receivedOkQty == null);
  const discrepancyItems = transfer.items.filter((item) => discrepancyUnits(item) > 0);
  const unresolvedItems = discrepancyItems.filter(hasUnresolvedQuarantine);
  const totalRequested = transfer.items.reduce((sum, item) => sum + item.requestedQty, 0);
  const totalAccepted = transfer.items.reduce((sum, item) => sum + (item.receivedOkQty ?? 0), 0);
  const documentNumber = transfer.documentNumber ?? `Legacy · ${transfer.id.slice(0, 8).toUpperCase()}`;

  return (
    <div>
      <AdminWorkspaceNav workspace="inventory" activeHref="/admin/warehouse" />
      <header className="mb-4 rounded-[22px] bg-[#ece7e0] px-5 py-4 shadow-[0_12px_32px_rgba(72,50,36,.07)] print:shadow-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <Link href="/admin/warehouse" className="inline-flex h-9 w-fit items-center gap-1.5 rounded-xl bg-[#e2dcd4] px-3 text-[10.5px] font-bold text-[#62564d] hover:bg-[#d8d0c8] hover:text-[#C85956] print:hidden"><ArrowLeft className="h-3.5 w-3.5" />All requests</Link>
          <BrandMark brand={{ name: transfer.brandName, logoImage: transfer.brandLogoImage }} />
          <div className="min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#C85956]">{warehouseDocumentLabel(transfer.direction)}</p>
            <h1 className="mt-0.5 truncate text-[18px] font-extrabold text-[#302924]">{documentNumber}</h1>
            <p className="mt-1 text-[10.5px] text-[#756960]">{transfer.brandName} · Requested {formatDateTime(transfer.requestedAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto"><TonePill label={statusMeta.label} tone={statusMeta.tone} icon={statusMeta.icon} /><PrintWarehouseDocumentButton /><Link href={`/admin/brands/${encodeURIComponent(transfer.brandSlug)}/edit`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#e2dcd4] px-3 text-[10.5px] font-bold text-[#62564d] hover:bg-[#d8d0c8] hover:text-[#302924] print:hidden">Open brand<ExternalLink className="h-3 w-3" /></Link></div>
        </div>
      </header>

      <div className="space-y-4">
        <LifecycleTimeline transfer={transfer} />
        <WarehouseDocumentActions transferId={transfer.id} status={transfer.status} />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetadataCard label="Document type" value={warehouseDocumentLabel(transfer.direction)} detail={transfer.documentType ? titleCase(transfer.documentType) : "Historical document"} />
          <MetadataCard label="Requested by" value={transfer.requestedByEmail ?? "Brand team"} detail={formatDateTime(transfer.requestedAt)} />
          <MetadataCard label="Document totals" value={`${formatCount(transfer.items.length)} variants · ${formatCount(totalRequested)} units`} detail={`${formatCount(totalAccepted)} accepted so far`} />
          <MetadataCard label="Reconciliation" value={titleCase(transfer.reconciliationStatus)} detail={transfer.receipts.length ? `${formatCount(transfer.receipts.length)} physical receipt document${transfer.receipts.length === 1 ? "" : "s"}` : discrepancyItems.length ? `${formatCount(discrepancyItems.length)} legacy discrepancy lines` : "No physical receipt document yet"} warning={transfer.reconciliationStatus === "open_discrepancy" || unresolvedItems.length > 0} />
        </section>

        {transfer.brandNote ? <section className="rounded-[18px] bg-[#f7f3ef] px-4 py-3"><p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">Brand note</p><p className="mt-1.5 text-[11.5px] leading-5 text-[#403730]">{transfer.brandNote}</p></section> : null}

        {RECEIVABLE_STATUSES.has(transfer.status) && unreconciledItems.length ? <TransferReceiveForm transferId={transfer.id} items={unreconciledItems} variantOptions={variantOptions} isReturn={isReturn} /> : null}
        {transfer.status === "receiving" ? <section className="rounded-[20px] bg-violet-50 px-5 py-4 text-violet-900"><p className="text-[12px] font-extrabold">Receiving is already in progress</p><p className="mt-1 text-[10.5px]">Wait for the active warehouse operation to finish before reconciling another group of variants.</p></section> : null}

        <DocumentItems transfer={transfer} />
        {transfer.receipts.length ? <ReceiptHistory receipts={transfer.receipts} variants={variantOptions} items={transfer.items} /> : null}
        {transfer.status === "received" || transfer.status === "partially_received" ? <WarehouseCorrectionWorkspace transferId={transfer.id} variants={variantOptions} corrections={transfer.corrections} receipts={transfer.receipts} /> : null}
        <AuditTrail logs={auditLogs} />
      </div>
    </div>
  );
}

function LifecycleTimeline({ transfer }: { transfer: WarehouseTransferRow }) {
  const currentOrder = WAREHOUSE_STATUS_META[transfer.status].order;
  const terminal = transfer.status === "rejected" || transfer.status === "cancelled";
  const stages = [
    { label: "Requested", order: 0, detail: formatDateTime(transfer.requestedAt) },
    { label: "Review", order: 1, detail: transfer.status === "pending" || transfer.status === "submitted" ? "Needs action" : "Reviewed" },
    { label: "Approved", order: 2, detail: transfer.approvedAt ? formatDateTime(transfer.approvedAt) : "—" },
    { label: "In transit", order: 3, detail: currentOrder >= 3 ? "Shipment moving" : "—" },
    { label: terminal ? titleCase(transfer.status) : "Received", order: 5, detail: transfer.decidedAt ? formatDateTime(transfer.decidedAt) : "—" },
  ];
  return (
    <section aria-label="Document lifecycle" className="rounded-[20px] bg-[#ece7e0] px-4 py-4 shadow-[0_12px_32px_rgba(72,50,36,.07)] sm:px-5">
      <div className="grid gap-2 sm:grid-cols-5">
        {stages.map((stage, index) => {
          const complete = terminal ? (index < 2 || index === stages.length - 1) : currentOrder >= stage.order;
          const active = terminal ? index === stages.length - 1 : currentOrder === stage.order || (transfer.status === "partially_received" && stage.label === "Received");
          return <div key={stage.label} className="relative flex items-center gap-3 sm:block"><span className={`relative z-10 flex h-8 w-8 flex-none items-center justify-center rounded-full ${complete ? active ? "bg-[#C85956] text-white" : "bg-emerald-100 text-emerald-800" : "bg-[#e2dcd4] text-[#91837a]"}`}>{complete ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-3.5 w-3.5" />}</span>{index < stages.length - 1 ? <span className={`absolute left-4 top-8 hidden h-px w-[calc(100%-1rem)] sm:block ${complete && currentOrder > stage.order ? "bg-emerald-300" : "bg-[#d4cac1]"}`} /> : null}<div className="sm:mt-2"><p className="text-[10.5px] font-extrabold text-[#403730]">{stage.label}</p><p className="mt-0.5 text-[9px] text-[#8d8076]">{stage.detail}</p></div></div>;
        })}
      </div>
    </section>
  );
}

function MetadataCard({ label, value, detail, warning = false }: { label: string; value: string; detail: string; warning?: boolean }) {
  return <article className={`rounded-[18px] p-4 ${warning ? "bg-amber-50" : "bg-[#ece7e0]"}`}><p className={`text-[9.5px] font-bold uppercase tracking-[0.07em] ${warning ? "text-amber-800" : "text-[#756960]"}`}>{label}</p><p className="mt-1.5 truncate text-[12px] font-extrabold text-[#302924]">{value}</p><p className="mt-1 text-[9.5px] leading-4 text-[#8d8076]">{detail}</p></article>;
}

function DocumentItems({ transfer }: { transfer: WarehouseTransferRow }) {
  const brandSlug = encodeURIComponent(transfer.brandSlug);
  const v2ItemIds = new Set(transfer.receipts.flatMap((receipt) => receipt.lines.map((line) => line.expectedTransferItemId)));
  return (
    <section className="overflow-hidden rounded-[22px] bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <header className="border-b border-[#ddd4cc] px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Document lines</p><h2 className="mt-1 text-[15px] font-extrabold text-[#302924]">Every Variant and its reconciliation result</h2></header>
      <div className="divide-y divide-[#ddd4cc]">
        {transfer.items.map((item) => {
          const discrepancy = discrepancyUnits(item);
          const unresolved = hasUnresolvedQuarantine(item);
          return (
            <article key={item.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <VariantIdentity image={item.productImage} productName={item.productName} label={`${item.productName}${item.optionLabel ? ` — ${item.optionLabel}` : ""}`} sku={item.sku} />
                <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                  <ResultMetric label="Requested" value={item.requestedQty} />
                  <ResultMetric label={transfer.direction === "to_brand" ? "Returned" : "Received"} value={item.receivedOkQty} />
                  <ResultMetric label="Damaged" value={item.damagedQty} warning={(item.damagedQty ?? 0) > 0} />
                  <ResultMetric label="Missing" value={item.missingQty} warning={(item.missingQty ?? 0) > 0} />
                  {item.receivedOkQty == null ? <TonePill label="Awaiting receipt" tone="amber" icon={Clock3} /> : discrepancy === 0 ? <TonePill label="Reconciled" tone="emerald" icon={CheckCircle2} /> : unresolved ? <TonePill label={v2ItemIds.has(item.id) ? "Open discrepancy" : "Legacy quarantine"} tone="amber" icon={AlertTriangle} /> : <TonePill label={item.quarantineResolution ? titleCase(item.quarantineResolution) : "Resolved"} tone="neutral" icon={CheckCircle2} />}
                  <Link href={`/admin/inventory?view=activity&brand=${brandSlug}&variantId=${encodeURIComponent(item.variantId)}`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#e2dcd4] px-2.5 text-[9.5px] font-bold text-[#5b5049] hover:bg-[#242424] hover:text-white"><Activity className="h-3 w-3" />Ledger</Link>
                </div>
              </div>
              {item.itemNote ? <p className="mt-3 rounded-xl bg-[#f8f4f0] px-3 py-2 text-[10px] text-[#62564d]"><strong>Line note:</strong> {item.itemNote}</p> : null}
              {unresolved && !v2ItemIds.has(item.id) ? <QuarantineResolutionForm transferItemId={item.id} quantity={discrepancy} sku={item.sku} /> : null}
              {unresolved && v2ItemIds.has(item.id) ? <p className="mt-2 text-[9.5px] font-semibold text-amber-900">Resolve this line through a linked correction document below. Missing units are tracked as a claim, not as physical quarantine.</p> : null}
              {item.quarantineResolvedAt ? <p className="mt-2 text-[9.5px] font-semibold text-emerald-800">Quarantine resolved {formatDateTime(item.quarantineResolvedAt)} · {item.quarantineResolution ? titleCase(item.quarantineResolution) : "Resolved"}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReceiptHistory({ receipts, variants, items }: { receipts: WarehouseReceiptRow[]; variants: WarehouseReceiptVariantOption[]; items: WarehouseTransferRow["items"] }) {
  const variantLabel = new Map(variants.map((variant) => [variant.variantId, `${variant.productName}${variant.optionLabel ? ` — ${variant.optionLabel}` : ""} · ${variant.sku}`]));
  const expectedItem = new Map(items.map((item) => [item.id, item]));
  return (
    <section className="overflow-hidden rounded-[22px] bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <header className="border-b border-[#ddd4cc] px-5 py-4"><div className="flex items-center gap-2"><PackageSearch className="h-4 w-4 text-[#C85956]" /><div><p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Physical receipts</p><h2 className="mt-1 text-[14px] font-extrabold text-[#302924]">Expected versus what actually arrived</h2></div></div></header>
      <div className="divide-y divide-[#ddd4cc]">
        {receipts.map((receipt) => (
          <details key={receipt.id} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 [&::-webkit-details-marker]:hidden"><span className="text-[11.5px] font-extrabold text-[#302924]">{receipt.receiptNumber}</span><TonePill label={titleCase(receipt.settlementStatus)} tone={receipt.settlementStatus === "clean" || receipt.settlementStatus === "settled" ? "emerald" : "amber"} icon={receipt.settlementStatus === "clean" ? CheckCircle2 : AlertTriangle} /><span className="text-[9.5px] text-[#8d8076] sm:ml-auto">{formatDateTime(receipt.postedAt)}</span></summary>
            <div className="mt-3 divide-y divide-[#e2d9d1] rounded-2xl bg-[#f8f4f0] px-4">
              {receipt.lines.map((line) => {
                const expected = expectedItem.get(line.expectedTransferItemId);
                const actual = line.actualVariantId ? variantLabel.get(line.actualVariantId) : line.unidentifiedSku ? `Unidentified · ${line.unidentifiedSku}` : "Not received";
                const changed = line.actualVariantId !== line.expectedVariantId;
                return <div key={line.id} className="grid gap-2 py-3 lg:grid-cols-[1fr_auto_1fr_auto]"><div><p className="text-[8.5px] font-bold uppercase tracking-[0.06em] text-[#8d8076]">Expected</p><p className="mt-1 text-[10.5px] font-extrabold text-[#403730]">{expected ? `${expected.productName}${expected.optionLabel ? ` — ${expected.optionLabel}` : ""} · ${expected.sku}` : line.expectedVariantId}</p></div><ArrowLeft className={`hidden h-4 w-4 self-center lg:block ${changed ? "text-violet-700" : "text-[#9b8e84]"}`} /><div><p className="text-[8.5px] font-bold uppercase tracking-[0.06em] text-[#8d8076]">Actually received</p><p className={`mt-1 text-[10.5px] font-extrabold ${changed ? "text-violet-800" : "text-[#403730]"}`}>{actual}</p></div><div className="flex flex-wrap items-center gap-1.5 lg:justify-end"><ReceiptQty label="Good" value={line.actualGoodQty} /><ReceiptQty label="Damaged" value={line.actualDamagedQty} warning /><ReceiptQty label="Short" value={line.expectedMissingQty} warning /><ReceiptQty label="Excess" value={line.actualExcessQty} /></div></div>;
              })}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function ReceiptQty({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <span className={`rounded-lg px-2 py-1 text-[9px] font-bold ${warning && value > 0 ? "bg-amber-50 text-amber-900" : "bg-[#e8e1db] text-[#62564d]"}`}>{label} {formatCount(value)}</span>;
}

function ResultMetric({ label, value, warning = false }: { label: string; value: number | null; warning?: boolean }) {
  return <span className={`min-w-[64px] rounded-xl px-2.5 py-2 text-center ${warning ? "bg-amber-50" : "bg-[#f7f3ef]"}`}><span className={`block text-[12px] font-extrabold tabular-nums ${warning ? "text-amber-900" : "text-[#403730]"}`}>{value == null ? "—" : formatCount(value)}</span><span className="mt-0.5 block text-[8px] font-bold uppercase tracking-[0.05em] text-[#8d8076]">{label}</span></span>;
}

function AuditTrail({ logs }: { logs: Awaited<ReturnType<typeof getAuditLogsForEntity>> }) {
  return (
    <section className="overflow-hidden rounded-[22px] bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <header className="border-b border-[#ddd4cc] px-5 py-4"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-[#C85956]" /><div><p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Audit trail</p><h2 className="mt-1 text-[14px] font-extrabold text-[#302924]">Who changed this document and when</h2></div></div></header>
      {logs.length ? <ol className="divide-y divide-[#ddd4cc]">{logs.map((log) => <li key={log.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center"><span className="text-[10.5px] font-extrabold text-[#403730]">{titleCase(log.action)}</span><span className="text-[10px] text-[#756960]">by {log.actorName ?? log.actorLabel}</span><span className="text-[9.5px] text-[#8d8076] sm:ml-auto">{formatDateTime(log.createdAt)}</span></li>)}</ol> : <p className="px-5 py-5 text-[10.5px] text-[#756960]">No audit events were recorded for this historical document.</p>}
    </section>
  );
}
