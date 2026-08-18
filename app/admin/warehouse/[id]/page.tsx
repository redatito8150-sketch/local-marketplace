import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
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
import TransferReceiveForm from "@/components/admin/warehouse/TransferReceiveForm";
import PrintWarehouseDocumentButton from "@/components/admin/warehouse/PrintWarehouseDocumentButton";
import WarehouseCorrectionWorkspace from "@/components/admin/warehouse/WarehouseCorrectionWorkspace";
import WarehouseDocumentHistory from "@/components/warehouse/WarehouseDocumentHistory";
import { BrandMark, TonePill, formatCount, titleCase } from "@/components/admin/inventory/shared";
import {
  WAREHOUSE_STATUS_META,
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
  const receivable = RECEIVABLE_STATUSES.has(transfer.status) && transfer.items.some((item) => item.receivedOkQty == null);
  const documentNumber = transfer.documentNumber ?? `Legacy · ${transfer.id.slice(0, 8).toUpperCase()}`;

  return (
    <div>
      <div className="mb-2 print:hidden">
        <Link href="/admin/warehouse" className="inline-flex w-fit items-center gap-1 text-[9.5px] font-semibold text-[#756960] transition-colors hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">
          <ArrowLeft className="h-3 w-3" />
          All requests
        </Link>
      </div>
      <header className="mb-4 rounded-[22px] border border-[#e6ded7] bg-white px-5 py-4 shadow-[0_10px_30px_rgba(72,50,36,.045)] print:border-0 print:shadow-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <BrandMark brand={{ name: transfer.brandName, logoImage: transfer.brandLogoImage }} />
          <div className="min-w-0">
            <p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#C85956]">{warehouseDocumentLabel(transfer.direction)}</p>
            <h1 className="mt-0.5 truncate text-[18px] font-extrabold text-[#302924]">{documentNumber}</h1>
            <p className="mt-1 text-[10.5px] text-[#756960]">{transfer.brandName} · Requested {formatDateTime(transfer.requestedAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto"><TonePill label={statusMeta.label} tone={statusMeta.tone} icon={statusMeta.icon} /><PrintWarehouseDocumentButton /><Link href={`/brand-portal/warehouse/${transfer.id}?brand=${encodeURIComponent(transfer.brandSlug)}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e6ded7] bg-[#f8f5f2] px-3 text-[10.5px] font-bold text-[#62564d] hover:bg-[#efe9e4] hover:text-[#302924] print:hidden">View brand portal<ExternalLink className="h-3 w-3" /></Link></div>
        </div>
      </header>

      <div className="space-y-4">
        {transfer.brandNote ? <section className="rounded-[18px] bg-[#f7f3ef] px-4 py-3"><p className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-[#756960]">Brand note</p><p className="mt-1.5 text-[11.5px] leading-5 text-[#403730]">{transfer.brandNote}</p></section> : null}

        {transfer.status === "received" ? (
          <WarehouseCorrectionWorkspace
            transferId={transfer.id}
            items={transfer.items}
            variants={variantOptions}
            corrections={transfer.corrections}
            receipts={transfer.receipts}
            brandSlug={transfer.brandSlug}
          />
        ) : (
          <TransferReceiveForm
            transferId={transfer.id}
            items={transfer.items}
            variantOptions={variantOptions}
            brandSlug={transfer.brandSlug}
            receiptItemIds={transfer.receipts.flatMap((receipt) => receipt.lines.map((line) => line.expectedTransferItemId))}
            receivable={receivable}
            showLedger={["partially_received", "rejected"].includes(transfer.status)}
            isReturn={isReturn}
          />
        )}
        {transfer.status === "receiving" ? <section className="rounded-[20px] bg-violet-50 px-5 py-4 text-violet-900"><p className="text-[12px] font-extrabold">Receiving is already in progress</p><p className="mt-1 text-[10.5px]">Wait for the active warehouse operation to finish before reconciling another group of variants.</p></section> : null}

        {transfer.receipts.length && transfer.status !== "received" ? <ReceiptHistory receipts={transfer.receipts} variants={variantOptions} items={transfer.items} /> : null}
        <WarehouseDocumentHistory transfer={transfer} variants={variantOptions} logs={auditLogs} />
      </div>
    </div>
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
