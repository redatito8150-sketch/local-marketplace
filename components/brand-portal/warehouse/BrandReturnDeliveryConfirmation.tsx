"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, PackageCheck } from "lucide-react";
import { CONTROL, VariantIdentity, formatCount } from "@/components/admin/inventory/shared";
import type { WarehouseTransferItemRow } from "@/lib/data/warehouse";

type Props = {
  transferId: string;
  items: WarehouseTransferItemRow[];
};

function expectedQuantity(item: WarehouseTransferItemRow): number {
  return item.dispatchedQty ?? item.requestedQty;
}

export default function BrandReturnDeliveryConfirmation({ transferId, items }: Props) {
  const router = useRouter();
  const [arrived, setArrived] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalExpected = useMemo(() => items.reduce((sum, item) => sum + expectedQuantity(item), 0), [items]);

  async function confirmArrival() {
    if (!arrived || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/brand-portal/warehouse/returns/${transferId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arrived: true, note: note.trim() || undefined }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "We couldn't confirm this delivery.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn't confirm this delivery.");
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="Confirm return shipment arrival" className="overflow-hidden rounded-[22px] border border-[#e6ded7] bg-white shadow-[0_10px_30px_rgba(72,50,36,.045)]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#ddd4cc] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Shipment arrival</p>
          <h2 className="mt-1 text-[15px] font-extrabold text-[#302924]">Confirm that your return shipment arrived</h2>
        </div>
        <p className="text-[11px] font-extrabold text-[#403730]">{formatCount(items.length)} {items.length === 1 ? "variant" : "variants"} · {formatCount(totalExpected)} {totalExpected === 1 ? "unit" : "units"} expected</p>
      </header>

      <div className="divide-y divide-[#e7dfd8]">
        {items.map((item) => (
          <article key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <VariantIdentity image={item.productImage} productName={item.productName} label={`${item.productName}${item.optionLabel ? ` — ${item.optionLabel}` : ""}`} sku={item.sku} />
            </div>
            <div className="flex h-12 min-w-[88px] flex-col items-center justify-center rounded-xl bg-[#f7f3ef] px-3">
              <span className="text-[13px] font-extrabold tabular-nums text-[#403730]">{formatCount(expectedQuantity(item))}</span>
              <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.05em] text-[#8d8076]">Expected</span>
            </div>
          </article>
        ))}
      </div>

      <div className="space-y-4 border-t border-[#ddd4cc] bg-[#fcfaf8] px-5 py-4">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#ded4cb] bg-white p-4">
          <input type="checkbox" checked={arrived} onChange={(event) => { setArrived(event.target.checked); setError(null); }} className="mt-0.5 h-4 w-4 flex-none accent-[#C85956]" />
          <span><span className="block text-[11.5px] font-extrabold text-[#403730]">I confirm that this shipment arrived.</span><span className="mt-1 block text-[9.5px] leading-4 text-[#81746b]">Confirming closes this Stock Return Note as Returned to brand.</span></span>
        </label>

        <label className="block">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#756960]">Note <span className="font-medium normal-case tracking-normal">(optional)</span></span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Explain any problem and the Zakhnook team will contact you." rows={3} className={`${CONTROL} mt-1.5 h-auto w-full bg-white py-2.5`} />
        </label>

        {error ? <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-[11px] font-semibold text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}

        <div className="flex justify-end">
          <button type="button" onClick={confirmArrival} disabled={!arrived || submitting} className="inline-flex h-11 items-center rounded-xl bg-[#C85956] px-5 text-[12px] font-bold text-white transition-colors hover:bg-[#b84e4b] disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : arrived ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <PackageCheck className="mr-2 h-4 w-4" />}
            {submitting ? "Confirming…" : "Confirm shipment received"}
          </button>
        </div>
      </div>
    </section>
  );
}
