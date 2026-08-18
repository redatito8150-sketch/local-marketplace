import { AlertTriangle, ArrowLeft, CheckCircle2, PackageSearch } from "lucide-react";
import type { WarehouseReceiptRow, WarehouseReceiptVariantOption, WarehouseTransferRow } from "@/lib/data/warehouse";
import { formatDateTime } from "@/lib/format";
import { TonePill, formatCount, titleCase } from "@/components/admin/inventory/shared";

export default function WarehouseReceiptHistory({ receipts, variants, items }: { receipts: WarehouseReceiptRow[]; variants: WarehouseReceiptVariantOption[]; items: WarehouseTransferRow["items"] }) {
  const variantLabel = new Map(variants.map((variant) => [variant.variantId, `${variant.productName}${variant.optionLabel ? ` — ${variant.optionLabel}` : ""} · ${variant.sku}`]));
  const expectedItem = new Map(items.map((item) => [item.id, item]));

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#e6ded7] bg-white shadow-[0_10px_30px_rgba(72,50,36,.045)]">
      <header className="border-b border-[#ddd4cc] px-4 py-4 sm:px-5"><div className="flex items-center gap-2"><PackageSearch className="h-4 w-4 text-[#C85956]" /><div><p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Physical receipts</p><h2 className="mt-1 text-[14px] font-extrabold text-[#302924]">Expected versus what actually arrived</h2></div></div></header>
      <div className="divide-y divide-[#ddd4cc]">
        {receipts.map((receipt) => (
          <details key={receipt.id} className="group px-4 py-4 sm:px-5">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 [&::-webkit-details-marker]:hidden"><span className="text-[11.5px] font-extrabold text-[#302924]">{receipt.receiptNumber}</span><TonePill label={titleCase(receipt.settlementStatus)} tone={receipt.settlementStatus === "clean" || receipt.settlementStatus === "settled" ? "emerald" : "amber"} icon={receipt.settlementStatus === "clean" ? CheckCircle2 : AlertTriangle} /><span className="text-[9.5px] text-[#8d8076] sm:ml-auto">{formatDateTime(receipt.postedAt)}</span></summary>
            <div className="mt-3 divide-y divide-[#e2d9d1] rounded-2xl bg-[#f8f4f0] px-3 sm:px-4">
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
