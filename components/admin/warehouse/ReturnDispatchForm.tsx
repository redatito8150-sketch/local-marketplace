"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PackageCheck, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { CONTROL, VariantIdentity, formatCount } from "@/components/admin/inventory/shared";
import type { WarehouseTransferItemRow } from "@/lib/data/warehouse";

type Props = {
  transferId: string;
  items: WarehouseTransferItemRow[];
};

type DispatchLine = {
  quantity: string;
  note: string;
};

export default function ReturnDispatchForm({ transferId, items }: Props) {
  const router = useRouter();
  const [lines, setLines] = useState<Record<string, DispatchLine>>(() => Object.fromEntries(
    items.map((item) => [item.id, { quantity: "", note: "" }]),
  ));
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completedLines = useMemo(() => items.filter((item) => lines[item.id]?.quantity.trim() !== ""), [items, lines]);
  const totalRequested = useMemo(() => items.reduce((sum, item) => sum + item.requestedQty, 0), [items]);
  const valid = items.length > 0 && items.every((item) => {
    const quantity = Number(lines[item.id]?.quantity);
    return lines[item.id]?.quantity.trim() !== "" && Number.isInteger(quantity) && quantity === item.requestedQty;
  });

  function updateLine(itemId: string, patch: Partial<DispatchLine>) {
    setLines((current) => ({ ...current, [itemId]: { ...current[itemId], ...patch } }));
    setReviewing(false);
    setError(null);
  }

  function resetLines() {
    setLines(Object.fromEntries(items.map((item) => [item.id, { quantity: "", note: "" }])));
    setNote("");
    setReviewing(false);
    setError(null);
  }

  async function dispatchReturn() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/warehouse/documents/${transferId}/in-transit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item) => ({
            itemId: item.id,
            dispatchedQty: Number(lines[item.id].quantity),
            itemNote: lines[item.id].note.trim() || undefined,
          })),
          note: note.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Failed to dispatch this return");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to dispatch this return");
      setSubmitting(false);
      setReviewing(false);
    }
  }

  if (!items.length) return null;

  return (
    <section className="overflow-hidden rounded-[22px] border border-[#e6ded7] bg-white shadow-[0_10px_30px_rgba(72,50,36,.045)]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#ddd4cc] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Document lines · before dispatch</p>
          <h2 className="mt-1 text-[15px] font-extrabold text-[#302924]">Count every Variant in the outgoing package</h2>
          <p className="mt-1 text-[10px] leading-4 text-[#756960]">Complete every line first. Dispatch stays locked until the package matches the approved request.</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-extrabold text-[#403730]">{formatCount(items.length)} {items.length === 1 ? "variant" : "variants"} · {formatCount(totalRequested)} units</p>
          <p className="mt-0.5 text-[9.5px] text-[#8d8076]">{formatCount(completedLines.length)} of {formatCount(items.length)} lines filled</p>
        </div>
      </header>

      {error ? <div role="alert" className="mx-5 mt-4 rounded-xl bg-red-50 px-4 py-3 text-[11px] font-semibold text-red-800">{error}</div> : null}

      <div className="divide-y divide-[#ddd4cc]">
        {items.map((item) => {
          const line = lines[item.id];
          const entered = line.quantity.trim() !== "";
          const matches = entered && Number(line.quantity) === item.requestedQty;
          return (
            <article key={item.id} className={`px-5 py-4 ${entered ? "bg-[#faf7f4]" : ""}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <VariantIdentity image={item.productImage} productName={item.productName} label={`${item.productName}${item.optionLabel ? ` — ${item.optionLabel}` : ""}`} sku={item.sku} />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex h-12 min-w-[74px] flex-col items-center justify-center rounded-xl bg-[#f1ebe6] px-3">
                    <span className="text-[12px] font-extrabold tabular-nums text-[#403730]">{formatCount(item.requestedQty)}</span>
                    <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.05em] text-[#8d8076]">On hold</span>
                  </div>
                  <label className={`flex h-12 min-w-[86px] flex-col items-center justify-center rounded-xl px-3 ${entered && !matches ? "bg-red-50" : matches ? "bg-emerald-50" : "bg-[#f7f3ef]"}`}>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={line.quantity}
                      onChange={(event) => updateLine(item.id, { quantity: event.target.value })}
                      className={`h-5 w-14 appearance-none border-0 bg-transparent p-0 text-center text-[12px] font-extrabold tabular-nums outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${entered && !matches ? "text-red-800" : "text-[#403730]"}`}
                      aria-label={`Packed quantity for ${item.sku}`}
                    />
                    <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.05em] text-[#8d8076]">Packed</span>
                  </label>
                  {matches ? <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-[9.5px] font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />Ready</span> : null}
                </div>
              </div>
              <label className="mt-3 block">
                <span className="sr-only">Dispatch note for {item.sku}</span>
                <input value={line.note} onChange={(event) => updateLine(item.id, { note: event.target.value })} placeholder="Optional line note — package, seal or condition…" className={`${CONTROL} h-9 w-full bg-[#f8f4f0] text-[10.5px]`} />
              </label>
              {entered && !matches ? <p className="mt-2 text-[9.5px] font-semibold text-red-700">Packed quantity must equal the {formatCount(item.requestedQty)} units held for this line.</p> : null}
            </article>
          );
        })}
      </div>

      <div className="border-t border-[#ddd4cc] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[10px] font-bold text-[#62564d]">All {formatCount(items.length)} lines are required before dispatch</p>{!valid && completedLines.length > 0 ? <p className="mt-1 text-[9.5px] text-amber-800">Finish every line and match each held quantity.</p> : null}</div>
          <div className="flex items-center gap-2">
            {completedLines.length ? <button type="button" onClick={resetLines} className="inline-flex h-10 items-center gap-1.5 px-2 text-[10px] font-bold text-[#756960] hover:text-[#C85956]"><RotateCcw className="h-3.5 w-3.5" />Clear</button> : null}
            <button type="button" onClick={() => setReviewing(true)} disabled={!valid} className="inline-flex h-11 items-center rounded-xl bg-[#242424] px-5 text-[12px] font-bold text-white hover:bg-[#3a332e] disabled:cursor-not-allowed disabled:opacity-35"><ShieldCheck className="mr-2 h-4 w-4" />Review dispatch</button>
          </div>
        </div>

        {reviewing ? <div className="mt-4 rounded-2xl bg-[#f8f4f0] p-4 ring-1 ring-[#ded4cb]">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-sky-50 text-sky-800"><PackageCheck className="h-4 w-4" /></span><div><h3 className="text-[13px] font-extrabold text-[#302924]">Dispatch {formatCount(totalRequested)} units to the brand?</h3><p className="mt-1 text-[10.5px] leading-5 text-[#756960]">This records every Document line and moves the package from Return hold at Zakhnook to In transit to brand. It does not mark the stock as returned.</p></div></div>
          <label className="mt-3 block"><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#756960]">Dispatch note <span className="font-medium normal-case tracking-normal">(optional, visible in history)</span></span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Courier, handover or package reference…" className={`${CONTROL} mt-1.5 h-auto w-full bg-white py-2.5`} /></label>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={dispatchReturn} disabled={submitting} className="inline-flex h-11 items-center rounded-xl bg-[#C85956] px-5 text-[12px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-60">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{submitting ? "Dispatching…" : "Confirm dispatch"}</button><button type="button" onClick={() => setReviewing(false)} disabled={submitting} className="h-11 rounded-xl px-4 text-[11px] font-bold text-[#62564d] hover:bg-[#ece5df]">Back to lines</button></div>
        </div> : null}
      </div>
    </section>
  );
}
