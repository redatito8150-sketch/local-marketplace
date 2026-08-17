"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeftRight,
  CheckCircle2,
  Loader2,
  PackageSearch,
  ShieldCheck,
} from "lucide-react";
import { VariantIdentity, CONTROL, formatCount } from "@/components/admin/inventory/shared";
import type {
  WarehouseReceiptVariantOption,
  WarehouseTransferItemRow,
} from "@/lib/data/warehouse";

type Row = {
  actualVariantId: string | null;
  goodQty: number;
  damagedQty: number;
  missingQty: number;
  unidentifiedQty: number;
  unidentifiedSku: string;
  itemNote: string;
};

type Props = {
  transferId: string;
  items: WarehouseTransferItemRow[];
  variantOptions: WarehouseReceiptVariantOption[];
  isReturn?: boolean;
};

function physicalTotal(row: Row): number {
  return row.goodQty + row.damagedQty + row.unidentifiedQty;
}

function expectedMissing(item: WarehouseTransferItemRow, row: Row): number {
  if (row.actualVariantId !== item.variantId || row.unidentifiedQty > 0) return item.requestedQty;
  return Math.max(item.requestedQty - physicalTotal(row), 0);
}

function actualExcess(item: WarehouseTransferItemRow, row: Row): number {
  return Math.max(physicalTotal(row) - item.requestedQty, 0);
}

export default function TransferReceiveForm({ transferId, items, variantOptions, isReturn = false }: Props) {
  const router = useRouter();
  const operationKey = useRef(crypto.randomUUID());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Record<string, Row>>(
    Object.fromEntries(items.map((item) => [item.id, {
      actualVariantId: item.variantId,
      goodQty: item.requestedQty,
      damagedQty: 0,
      missingQty: 0,
      unidentifiedQty: 0,
      unidentifiedSku: "",
      itemNote: "",
    }]))
  );
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedItems = useMemo(() => items.filter((item) => selected.has(item.id)), [items, selected]);
  const valid = selectedItems.length > 0 && selectedItems.every((item) => {
    const row = rows[item.id];
    const countsValid = [row.goodQty, row.damagedQty, row.missingQty, row.unidentifiedQty]
      .every((value) => Number.isInteger(value) && value >= 0);
    if (!countsValid) return false;
    if (isReturn) return row.goodQty + row.damagedQty + row.missingQty === item.requestedQty;
    if (!row.actualVariantId && row.goodQty + row.damagedQty > 0) return false;
    if (row.unidentifiedQty > 0 && !row.unidentifiedSku.trim()) return false;
    return true;
  });

  const totals = useMemo(() => selectedItems.reduce((sum, item) => {
    const row = rows[item.id];
    return {
      requested: sum.requested + item.requestedQty,
      good: sum.good + row.goodQty,
      damaged: sum.damaged + row.damagedQty,
      missing: sum.missing + (isReturn ? row.missingQty : expectedMissing(item, row)),
      excess: sum.excess + (isReturn ? 0 : actualExcess(item, row)),
      unidentified: sum.unidentified + row.unidentifiedQty,
    };
  }, { requested: 0, good: 0, damaged: 0, missing: 0, excess: 0, unidentified: 0 }), [isReturn, rows, selectedItems]);

  function updateRow(itemId: string, patch: Partial<Row>) {
    setReviewing(false);
    setRows((previous) => ({
      ...previous,
      [itemId]: { ...previous[itemId], ...patch },
    }));
  }

  function updateReturnRow(item: WarehouseTransferItemRow, patch: Partial<Row>) {
    setReviewing(false);
    setRows((previous) => {
      const current = { ...previous[item.id], ...patch };
      if (patch.goodQty !== undefined) {
        const remaining = Math.max(0, item.requestedQty - patch.goodQty);
        current.damagedQty = Math.min(current.damagedQty, remaining);
        current.missingQty = Math.max(0, remaining - current.damagedQty);
      } else if (patch.damagedQty !== undefined || patch.missingQty !== undefined) {
        current.goodQty = Math.max(0, item.requestedQty - current.damagedQty - current.missingQty);
      }
      return { ...previous, [item.id]: current };
    });
  }

  function toggleItem(itemId: string, checked: boolean) {
    setReviewing(false);
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/warehouse/transfers/${transferId}/receive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(isReturn ? {} : { "Idempotency-Key": operationKey.current }),
        },
        body: JSON.stringify({
          items: selectedItems.map((item) => {
            const row = rows[item.id];
            return isReturn
              ? {
                itemId: item.id,
                receivedOkQty: row.goodQty,
                damagedQty: row.damagedQty,
                missingQty: row.missingQty,
                itemNote: row.itemNote,
              }
              : {
                itemId: item.id,
                actualVariantId: row.actualVariantId,
                goodQty: row.goodQty,
                damagedQty: row.damagedQty,
                unidentifiedQty: row.unidentifiedQty,
                unidentifiedSku: row.unidentifiedSku,
                itemNote: row.itemNote,
              };
          }),
          note: note.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Failed to reconcile this document");
      operationKey.current = crypto.randomUUID();
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to reconcile this document");
      setSubmitting(false);
      setReviewing(false);
    }
  }

  if (!items.length) return null;

  return (
    <section className="overflow-hidden rounded-[22px] bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <header className="border-b border-[#ddd4cc] px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#C85956]">{isReturn ? "Reconcile return" : "Expected vs actual"}</p>
        <h2 className="mt-1 text-[15px] font-extrabold text-[#302924]">{isReturn ? "Choose the physical lines being returned" : "Record what physically arrived — including the wrong Variant"}</h2>
        <p className="mt-1.5 max-w-4xl text-[10.5px] leading-5 text-[#756960]">{isReturn ? "Every selected line must reconcile to its requested quantity." : "The source document stays unchanged. Sellable stock is credited only to the actual Variant selected here; shortages, excess, damage and unidentified units remain visible as discrepancies."}</p>
      </header>

      {error ? <div role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}

      <div className="divide-y divide-[#ddd4cc]">
        {items.map((item) => {
          const row = rows[item.id];
          const checked = selected.has(item.id);
          const substitution = !isReturn && row.actualVariantId !== item.variantId;
          const missing = isReturn ? row.missingQty : expectedMissing(item, row);
          const excess = isReturn ? 0 : actualExcess(item, row);
          return (
            <article key={item.id} className={`px-5 py-4 ${checked ? "bg-[#f2ece6]" : ""}`}>
              <div className="flex items-center gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={checked} onChange={(event) => toggleItem(item.id, event.target.checked)} aria-label={`Receive ${item.sku} now`} className="h-4 w-4 flex-none accent-[#C85956]" />
                  <VariantIdentity image={item.productImage} productName={item.productName} label={`${item.productName}${item.optionLabel ? ` — ${item.optionLabel}` : ""}`} sku={item.sku} />
                </label>
                <span className="text-right"><span className="block text-[12px] font-extrabold tabular-nums text-[#403730]">{formatCount(item.requestedQty)}</span><span className="block text-[9px] text-[#8d8076]">expected</span></span>
              </div>

              {checked ? (
                <div className="mt-4 space-y-3 pl-7">
                  {!isReturn ? (
                    <div className={`rounded-2xl p-3 ${substitution ? "bg-violet-50" : "bg-[#f8f4f0]"}`}>
                      <div className="mb-2 flex items-center gap-2">
                        {substitution ? <ArrowLeftRight className="h-3.5 w-3.5 text-violet-700" /> : <PackageSearch className="h-3.5 w-3.5 text-[#756960]" />}
                        <span className={`text-[9.5px] font-bold uppercase tracking-[0.07em] ${substitution ? "text-violet-800" : "text-[#756960]"}`}>Actually received Variant</span>
                        {substitution ? <span className="ml-auto rounded-lg bg-violet-100 px-2 py-1 text-[9px] font-bold text-violet-800">Substitution</span> : null}
                      </div>
                      <select value={row.actualVariantId ?? "__unidentified__"} onChange={(event) => {
                        const unidentified = event.target.value === "__unidentified__";
                        updateRow(item.id, {
                          actualVariantId: unidentified ? null : event.target.value,
                          goodQty: unidentified ? 0 : row.goodQty,
                          damagedQty: unidentified ? 0 : row.damagedQty,
                          unidentifiedQty: unidentified ? Math.max(row.unidentifiedQty, item.requestedQty) : 0,
                        });
                      }} className={`${CONTROL} w-full bg-white`} aria-label={`Actual Variant for ${item.sku}`}>
                        {variantOptions.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variant.productName}{variant.optionLabel ? ` — ${variant.optionLabel}` : ""} · {variant.sku}</option>)}
                        <option value="__unidentified__">Unidentified SKU — hold for mapping</option>
                      </select>
                    </div>
                  ) : null}

                  <div className={`grid gap-2 ${isReturn ? "sm:grid-cols-3" : row.actualVariantId ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
                    {row.actualVariantId || isReturn ? (
                      <>
                        <QuantityInput label={isReturn ? "Returned OK" : "Good / sellable"} value={row.goodQty} onChange={(value) => isReturn ? updateReturnRow(item, { goodQty: value }) : updateRow(item.id, { goodQty: value })} />
                        <QuantityInput label="Damaged / hold" value={row.damagedQty} onChange={(value) => isReturn ? updateReturnRow(item, { damagedQty: value }) : updateRow(item.id, { damagedQty: value })} />
                        {isReturn ? <QuantityInput label="Missing" value={row.missingQty} onChange={(value) => updateReturnRow(item, { missingQty: value })} /> : null}
                      </>
                    ) : (
                      <>
                        <QuantityInput label="Unidentified units" value={row.unidentifiedQty} onChange={(value) => updateRow(item.id, { unidentifiedQty: value })} />
                        <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Scanned SKU / package ref</span><input value={row.unidentifiedSku} onChange={(event) => updateRow(item.id, { unidentifiedSku: event.target.value })} placeholder="Barcode or label…" className={`${CONTROL} mt-1 w-full bg-white`} /></label>
                      </>
                    )}
                  </div>

                  {!isReturn ? (
                    <div className="flex flex-wrap gap-2 text-[9.5px] font-semibold">
                      <span className={`rounded-lg px-2.5 py-1.5 ${missing ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>Expected shortage: {formatCount(missing)}</span>
                      <span className={`rounded-lg px-2.5 py-1.5 ${excess ? "bg-sky-50 text-sky-900" : "bg-[#e5dfd8] text-[#756960]"}`}>Actual excess: {formatCount(excess)}</span>
                      {row.damagedQty ? <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">Quality hold: {formatCount(row.damagedQty)}</span> : null}
                    </div>
                  ) : null}

                  <label className="block"><span className="sr-only">Item note for {item.sku}</span><input value={row.itemNote} onChange={(event) => updateRow(item.id, { itemNote: event.target.value })} placeholder="Line note — packaging, condition, substitution reason…" className={`${CONTROL} h-9 w-full text-[10.5px]`} /></label>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="space-y-3 border-t border-[#ddd4cc] px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => { setSelected(new Set(items.map((item) => item.id))); setReviewing(false); }} className="text-[10px] font-bold text-[#756960] hover:text-[#C85956]">Select all unreconciled variants</button>{selected.size ? <button type="button" onClick={() => { setSelected(new Set()); setReviewing(false); }} className="text-[10px] font-bold text-[#756960] hover:text-[#C85956]">Clear selection</button> : null}</div>
        <label className="block"><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#756960]">Receipt note <span className="font-medium normal-case tracking-normal">(visible to the brand)</span></span><textarea value={note} onChange={(event) => { setNote(event.target.value); setReviewing(false); }} placeholder="Condition, delivery reference or handover note…" rows={2} className={`${CONTROL} mt-1.5 h-auto w-full py-2.5`} /></label>
        {!reviewing ? (
          <button type="button" onClick={() => setReviewing(true)} disabled={!valid} className="inline-flex h-11 items-center rounded-xl bg-[#242424] px-5 text-[12px] font-bold text-white hover:bg-[#3a332e] disabled:cursor-not-allowed disabled:opacity-40"><ShieldCheck className="mr-2 h-4 w-4" />Review receipt · {formatCount(selected.size)} {selected.size === 1 ? "variant" : "variants"}</button>
        ) : (
          <div className="rounded-2xl bg-[#f8f4f0] p-4 ring-1 ring-[#ded4cb]">
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-amber-50 text-amber-800"><ShieldCheck className="h-4 w-4" /></span><div><h3 className="text-[13px] font-extrabold text-[#302924]">Final receipt review</h3><p className="mt-1 text-[10.5px] leading-5 text-[#756960]">Only {formatCount(totals.good)} good units will enter sellable stock, credited to the actual Variants. Every other unit remains traceable as damage, shortage, excess or unidentified stock.</p></div></div>
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#eee7e1] p-3 text-center sm:grid-cols-6"><ReviewMetric label="Expected" value={totals.requested} /><ReviewMetric label="Sellable" value={totals.good} /><ReviewMetric label="Damaged" value={totals.damaged} /><ReviewMetric label="Short" value={totals.missing} /><ReviewMetric label="Excess" value={totals.excess} /><ReviewMetric label="Unidentified" value={totals.unidentified} /></div>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={submit} disabled={submitting} className="inline-flex h-11 items-center rounded-xl bg-[#C85956] px-5 text-[12px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-60">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{submitting ? "Confirming…" : isReturn ? "Confirm return" : "Post physical receipt"}</button><button type="button" onClick={() => setReviewing(false)} disabled={submitting} className="h-11 rounded-xl px-4 text-[11px] font-bold text-[#62564d] hover:bg-[#ece5df]">Back to edit</button></div>
          </div>
        )}
      </div>
    </section>
  );
}

function QuantityInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">{label}</span><input type="number" inputMode="numeric" min={0} step={1} value={value} onChange={(event) => onChange(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} className={`${CONTROL} mt-1 w-full bg-white font-bold tabular-nums`} /></label>;
}

function ReviewMetric({ label, value }: { label: string; value: number }) {
  return <div><p className="text-[14px] font-extrabold tabular-nums text-[#302924]">{formatCount(value)}</p><p className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.06em] text-[#756960]">{label}</p></div>;
}
