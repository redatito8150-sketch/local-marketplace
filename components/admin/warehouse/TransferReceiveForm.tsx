"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Loader2,
  PackageSearch,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import QuarantineResolutionForm from "@/components/admin/warehouse/QuarantineResolutionForm";
import { CONTROL, TonePill, VariantIdentity, formatCount, titleCase } from "@/components/admin/inventory/shared";
import { discrepancyUnits, hasUnresolvedQuarantine } from "@/components/admin/warehouse/warehouseUi";
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

type QuantityField = "received" | "damaged" | "missing";

type Props = {
  transferId: string;
  items: WarehouseTransferItemRow[];
  variantOptions: WarehouseReceiptVariantOption[];
  brandSlug: string;
  receiptItemIds: string[];
  receivable: boolean;
  showLedger: boolean;
  isReturn?: boolean;
};

function physicalTotal(row: Row): number {
  return row.goodQty + row.damagedQty + row.unidentifiedQty;
}

function receivedQuantity(row: Row): number {
  return row.actualVariantId ? row.goodQty : row.unidentifiedQty;
}

function expectedMissing(item: WarehouseTransferItemRow, row: Row): number {
  if (row.actualVariantId !== item.variantId || row.unidentifiedQty > 0) return item.requestedQty;
  return Math.max(item.requestedQty - physicalTotal(row), 0);
}

function actualExcess(item: WarehouseTransferItemRow, row: Row): number {
  return Math.max(physicalTotal(row) - item.requestedQty, 0);
}

function initialRow(item: WarehouseTransferItemRow): Row {
  return {
    actualVariantId: item.variantId,
    goodQty: item.receivedOkQty ?? 0,
    damagedQty: item.damagedQty ?? 0,
    missingQty: item.missingQty ?? 0,
    unidentifiedQty: 0,
    unidentifiedSku: "",
    itemNote: item.itemNote ?? "",
  };
}

export default function TransferReceiveForm({ transferId, items, variantOptions, brandSlug, receiptItemIds, receivable, showLedger, isReturn = false }: Props) {
  const router = useRouter();
  const operationKey = useRef(crypto.randomUUID());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Record<string, Row>>(Object.fromEntries(items.map((item) => [item.id, initialRow(item)])));
  const [note, setNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receivedThroughV2 = useMemo(() => new Set(receiptItemIds), [receiptItemIds]);
  const editableItems = useMemo(() => items.filter((item) => receivable && item.receivedOkQty == null), [items, receivable]);
  const selectedItems = useMemo(() => editableItems.filter((item) => selected.has(item.id)), [editableItems, selected]);
  const totalRequested = useMemo(() => items.reduce((sum, item) => sum + item.requestedQty, 0), [items]);
  const totalAccepted = useMemo(() => items.reduce((sum, item) => sum + (item.receivedOkQty ?? 0), 0), [items]);

  const valid = selectedItems.length > 0 && selectedItems.every((item) => {
    const row = rows[item.id];
    const countsValid = [row.goodQty, row.damagedQty, row.missingQty, row.unidentifiedQty]
      .every((value) => Number.isInteger(value) && value >= 0);
    if (!countsValid) return false;
    if (isReturn) return row.goodQty + row.damagedQty + row.missingQty === item.requestedQty;
    if (row.missingQty !== expectedMissing(item, row)) return false;
    if (!row.actualVariantId) return row.goodQty === 0 && row.damagedQty === 0 && row.unidentifiedQty > 0 && Boolean(row.unidentifiedSku.trim());
    return row.unidentifiedQty === 0;
  });

  const totals = useMemo(() => selectedItems.reduce((sum, item) => {
    const row = rows[item.id];
    return {
      requested: sum.requested + item.requestedQty,
      good: sum.good + row.goodQty,
      damaged: sum.damaged + row.damagedQty,
      missing: sum.missing + row.missingQty,
      excess: sum.excess + (isReturn ? 0 : actualExcess(item, row)),
      unidentified: sum.unidentified + row.unidentifiedQty,
    };
  }, { requested: 0, good: 0, damaged: 0, missing: 0, excess: 0, unidentified: 0 }), [isReturn, rows, selectedItems]);

  function markSelected(itemId: string) {
    setSelected((current) => new Set(current).add(itemId));
    setReviewing(false);
    setError(null);
  }

  function updateQuantity(item: WarehouseTransferItemRow, field: QuantityField, value: number) {
    markSelected(item.id);
    setRows((previous) => {
      const current = { ...previous[item.id] };
      if (isReturn) {
        if (field === "received") current.goodQty = value;
        if (field === "damaged") current.damagedQty = value;
        if (field === "missing") current.missingQty = value;
        if (field === "missing") current.goodQty = Math.max(0, item.requestedQty - current.damagedQty - current.missingQty);
        else current.missingQty = Math.max(0, item.requestedQty - current.goodQty - current.damagedQty);
      } else {
        if (field === "received") {
          if (current.actualVariantId) current.goodQty = value;
          else current.unidentifiedQty = value;
        }
        if (field === "damaged") current.damagedQty = value;
        if (field === "missing") {
          current.missingQty = value;
          if (current.actualVariantId === item.variantId) current.goodQty = Math.max(0, item.requestedQty - current.damagedQty - current.missingQty);
        } else {
          current.missingQty = expectedMissing(item, current);
        }
      }
      return { ...previous, [item.id]: current };
    });
    if ((field === "damaged" || field === "missing") && value > 0) {
      setExpandedIssues((current) => new Set(current).add(item.id));
    }
  }

  function updateIssueRow(itemId: string, patch: Partial<Row>) {
    markSelected(itemId);
    setRows((previous) => ({ ...previous, [itemId]: { ...previous[itemId], ...patch } }));
  }

  function chooseActualVariant(item: WarehouseTransferItemRow, value: string) {
    markSelected(item.id);
    setExpandedIssues((current) => new Set(current).add(item.id));
    setRows((previous) => {
      const current = previous[item.id];
      const physicalReceived = receivedQuantity(current);
      if (value === "__unidentified__") {
        return {
          ...previous,
          [item.id]: {
            ...current,
            actualVariantId: null,
            goodQty: 0,
            damagedQty: 0,
            missingQty: item.requestedQty,
            unidentifiedQty: physicalReceived,
          },
        };
      }
      const next = {
        ...current,
        actualVariantId: value,
        goodQty: physicalReceived,
        unidentifiedQty: 0,
        unidentifiedSku: "",
      };
      next.missingQty = expectedMissing(item, next);
      return { ...previous, [item.id]: next };
    });
  }

  function toggleIssue(itemId: string) {
    setExpandedIssues((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function clearChanges() {
    setSelected(new Set());
    setExpandedIssues(new Set());
    setRows(Object.fromEntries(items.map((item) => [item.id, initialRow(item)])));
    setNote("");
    setReviewing(false);
    setError(null);
  }

  function beginReview() {
    if (!valid) return;
    const problems = selectedItems.filter((item) => {
      const row = rows[item.id];
      return row.actualVariantId !== item.variantId || row.damagedQty > 0 || row.missingQty > 0 || row.unidentifiedQty > 0;
    });
    if (problems.length) setExpandedIssues(new Set(problems.map((item) => item.id)));
    setReviewing(true);
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
              ? { itemId: item.id, receivedOkQty: row.goodQty, damagedQty: row.damagedQty, missingQty: row.missingQty, itemNote: row.itemNote }
              : { itemId: item.id, actualVariantId: row.actualVariantId, goodQty: row.goodQty, damagedQty: row.damagedQty, missingQty: row.missingQty, unidentifiedQty: row.unidentifiedQty, unidentifiedSku: row.unidentifiedSku, itemNote: row.itemNote };
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
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#ddd4cc] px-5 py-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#C85956]">Document lines</p>
          <h2 className="mt-1 text-[15px] font-extrabold text-[#302924]">Every Variant and its reconciliation result</h2>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-extrabold text-[#403730]">{formatCount(items.length)} variants · {formatCount(totalRequested)} units</p>
          <p className="mt-0.5 text-[9.5px] text-[#8d8076]">{formatCount(totalAccepted)} accepted so far</p>
        </div>
      </header>

      {error ? <div role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}

      <div className="divide-y divide-[#ddd4cc]">
        {items.map((item) => {
          const row = rows[item.id];
          const editable = receivable && item.receivedOkQty == null;
          const active = selected.has(item.id);
          const substitution = !isReturn && row.actualVariantId !== item.variantId;
          const discrepancy = discrepancyUnits(item);
          const unresolved = hasUnresolvedQuarantine(item);
          const missing = editable ? row.missingQty : item.missingQty ?? 0;
          const damaged = editable ? row.damagedQty : item.damagedQty ?? 0;
          const issueDetected = substitution || damaged > 0 || missing > 0 || row.unidentifiedQty > 0 || Boolean(row.itemNote.trim());
          const issueOpen = editable && expandedIssues.has(item.id);
          const actualVariantLabel = variantOptions.find((variant) => variant.variantId === row.actualVariantId);

          return (
            <article key={item.id} className={`px-5 py-4 ${active ? "bg-[#f2ece6]" : ""}`}>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                <div className="min-w-0 flex-1">
                  <VariantIdentity image={item.productImage} productName={item.productName} label={`${item.productName}${item.optionLabel ? ` — ${item.optionLabel}` : ""}`} sku={item.sku} />
                </div>

                <div className="flex flex-wrap items-end gap-2 xl:justify-end">
                  <StaticQuantity label="Requested" value={item.requestedQty} />
                  {editable ? <EditableQuantity label={isReturn ? "Returned" : "Received"} value={receivedQuantity(row)} active={active} onChange={(value) => updateQuantity(item, "received", value)} /> : <StaticQuantity label={isReturn ? "Returned" : "Received"} value={item.receivedOkQty ?? 0} />}
                  {editable ? <EditableQuantity label="Damaged" value={damaged} active={active} warning={damaged > 0} onChange={(value) => updateQuantity(item, "damaged", value)} /> : <StaticQuantity label="Damaged" value={damaged} />}
                  {editable ? <EditableQuantity label="Missing" value={missing} active={active} warning={missing > 0} onChange={(value) => updateQuantity(item, "missing", value)} /> : <StaticQuantity label="Missing" value={missing} />}

                  {editable ? (
                    <button type="button" onClick={() => toggleIssue(item.id)} className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[9.5px] font-bold transition ${issueDetected ? "bg-amber-50 text-amber-900" : "bg-[#e2dcd4] text-[#62564d] hover:bg-[#d8d0c8]"}`} aria-expanded={issueOpen}>
                      {issueDetected ? <AlertTriangle className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                      {issueDetected ? "Receipt issue" : "Different Variant or note"}
                      <ChevronDown className={`h-3 w-3 transition-transform ${issueOpen ? "rotate-180" : ""}`} />
                    </button>
                  ) : discrepancy === 0 ? <TonePill label="Reconciled" tone="emerald" icon={CheckCircle2} /> : unresolved ? <TonePill label={receivedThroughV2.has(item.id) ? "Open discrepancy" : "Legacy quarantine"} tone="amber" icon={AlertTriangle} /> : <TonePill label={item.quarantineResolution ? titleCase(item.quarantineResolution) : "Resolved"} tone="neutral" icon={CheckCircle2} />}

                  {showLedger ? <Link href={`/admin/inventory?view=activity&brand=${encodeURIComponent(brandSlug)}&variantId=${encodeURIComponent(item.variantId)}`} className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#e2dcd4] px-3 text-[9.5px] font-bold text-[#5b5049] hover:bg-[#242424] hover:text-white"><Activity className="h-3 w-3" />Ledger</Link> : null}
                </div>
              </div>

              {issueOpen ? (
                <div className={`mt-3 space-y-3 rounded-2xl p-3 ${substitution ? "bg-violet-50" : "bg-[#f8f4f0]"}`}>
                  {!isReturn ? (
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        {substitution ? <ArrowLeftRight className="h-3.5 w-3.5 text-violet-700" /> : <PackageSearch className="h-3.5 w-3.5 text-[#756960]" />}
                        <span className={`text-[9.5px] font-bold uppercase tracking-[0.07em] ${substitution ? "text-violet-800" : "text-[#756960]"}`}>Actually received Variant</span>
                        {substitution ? <span className="ml-auto rounded-lg bg-violet-100 px-2 py-1 text-[9px] font-bold text-violet-800">Substitution</span> : null}
                      </div>
                      <select value={row.actualVariantId ?? "__unidentified__"} onChange={(event) => chooseActualVariant(item, event.target.value)} className={`${CONTROL} w-full bg-white`} aria-label={`Actual Variant for ${item.sku}`}>
                        {variantOptions.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variant.productName}{variant.optionLabel ? ` — ${variant.optionLabel}` : ""} · {variant.sku}</option>)}
                        <option value="__unidentified__">Unidentified SKU — hold for mapping</option>
                      </select>
                      {actualVariantLabel && substitution ? <p className="mt-2 text-[9.5px] font-semibold text-violet-800">Stock will be credited to {actualVariantLabel.productName}{actualVariantLabel.optionLabel ? ` — ${actualVariantLabel.optionLabel}` : ""}.</p> : null}
                    </div>
                  ) : null}

                  {!row.actualVariantId && !isReturn ? <label className="block"><span className="text-[9px] font-bold uppercase tracking-[0.07em] text-[#756960]">Scanned SKU / package reference</span><input value={row.unidentifiedSku} onChange={(event) => updateIssueRow(item.id, { unidentifiedSku: event.target.value })} placeholder="Barcode or label…" className={`${CONTROL} mt-1 w-full bg-white`} /></label> : null}

                  {!isReturn && (missing > 0 || actualExcess(item, row) > 0 || damaged > 0) ? (
                    <div className="flex flex-wrap gap-2 text-[9.5px] font-semibold">
                      {missing > 0 ? <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">Expected shortage: {formatCount(missing)}</span> : null}
                      {actualExcess(item, row) > 0 ? <span className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-sky-900">Actual excess: {formatCount(actualExcess(item, row))}</span> : null}
                      {damaged > 0 ? <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">Quality hold: {formatCount(damaged)}</span> : null}
                    </div>
                  ) : null}

                  <label className="block"><span className="sr-only">Item note for {item.sku}</span><input value={row.itemNote} onChange={(event) => updateIssueRow(item.id, { itemNote: event.target.value })} placeholder="Line note — packaging, condition or substitution reason…" className={`${CONTROL} h-9 w-full bg-white text-[10.5px]`} /></label>
                </div>
              ) : null}

              {!editable && item.itemNote ? <p className="mt-3 rounded-xl bg-[#f8f4f0] px-3 py-2 text-[10px] text-[#62564d]"><strong>Line note:</strong> {item.itemNote}</p> : null}
              {!editable && unresolved && !receivedThroughV2.has(item.id) ? <QuarantineResolutionForm transferItemId={item.id} quantity={discrepancy} sku={item.sku} /> : null}
              {!editable && unresolved && receivedThroughV2.has(item.id) ? <p className="mt-2 text-[9.5px] font-semibold text-amber-900">Resolve this line through a linked correction document below. Missing units are tracked as a claim, not as physical quarantine.</p> : null}
              {!editable && item.quarantineResolvedAt ? <p className="mt-2 text-[9.5px] font-semibold text-emerald-800">Quarantine resolved {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.quarantineResolvedAt))} · {item.quarantineResolution ? titleCase(item.quarantineResolution) : "Resolved"}</p> : null}
            </article>
          );
        })}
      </div>

      {editableItems.length ? (
        <div className="border-t border-[#ddd4cc] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-[#62564d]">{formatCount(selected.size)} of {formatCount(editableItems.length)} variants edited</p>
              {selected.size > 0 && !valid ? <p className="mt-1 text-[9.5px] text-amber-800">Received, damaged and missing must reconcile the requested quantity.</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selected.size ? <button type="button" onClick={clearChanges} className="inline-flex h-10 items-center gap-1.5 px-2 text-[10px] font-bold text-[#756960] hover:text-[#C85956]"><RotateCcw className="h-3.5 w-3.5" />Clear changes</button> : null}
              <button type="button" onClick={beginReview} disabled={!valid} className="inline-flex h-11 items-center rounded-xl bg-[#242424] px-5 text-[12px] font-bold text-white hover:bg-[#3a332e] disabled:cursor-not-allowed disabled:opacity-40"><ShieldCheck className="mr-2 h-4 w-4" />Review receipt · {formatCount(selected.size)} {selected.size === 1 ? "variant" : "variants"}</button>
            </div>
          </div>

          {reviewing ? (
            <div className="mt-4 rounded-2xl bg-[#f8f4f0] p-4 ring-1 ring-[#ded4cb]">
              <div className="flex items-start gap-3"><span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-amber-50 text-amber-800"><ShieldCheck className="h-4 w-4" /></span><div><h3 className="text-[13px] font-extrabold text-[#302924]">Final receipt review</h3><p className="mt-1 text-[10.5px] leading-5 text-[#756960]">Only {formatCount(totals.good)} good units will enter sellable stock. Damage, shortages, excess and substitutions stay traceable.</p></div></div>
              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#eee7e1] p-3 text-center sm:grid-cols-6"><ReviewMetric label="Requested" value={totals.requested} /><ReviewMetric label="Sellable" value={totals.good} /><ReviewMetric label="Damaged" value={totals.damaged} /><ReviewMetric label="Missing" value={totals.missing} /><ReviewMetric label="Excess" value={totals.excess} /><ReviewMetric label="Unidentified" value={totals.unidentified} /></div>
              <label className="mt-3 block"><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#756960]">Receipt note <span className="font-medium normal-case tracking-normal">(optional, visible to the brand)</span></span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Condition, delivery reference or handover note…" rows={2} className={`${CONTROL} mt-1.5 h-auto w-full bg-white py-2.5`} /></label>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={submit} disabled={submitting} className="inline-flex h-11 items-center rounded-xl bg-[#C85956] px-5 text-[12px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-60">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}{submitting ? "Confirming…" : isReturn ? "Confirm return" : "Post physical receipt"}</button><button type="button" onClick={() => setReviewing(false)} disabled={submitting} className="h-11 rounded-xl px-4 text-[11px] font-bold text-[#62564d] hover:bg-[#ece5df]">Back to edit</button></div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function StaticQuantity({ label, value }: { label: string; value: number }) {
  return <div className="flex h-12 min-w-[68px] flex-col items-center justify-center rounded-xl bg-[#f7f3ef] px-2"><span className="text-[12px] font-extrabold tabular-nums text-[#403730]">{formatCount(value)}</span><span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.05em] text-[#8d8076]">{label}</span></div>;
}

function EditableQuantity({ label, value, active, warning = false, onChange }: { label: string; value: number; active: boolean; warning?: boolean; onChange: (value: number) => void }) {
  return (
    <label className={`flex h-12 min-w-[68px] flex-col items-center justify-center rounded-xl px-2 ${warning ? "bg-amber-50" : "bg-[#f7f3ef]"}`}>
      <input type="number" inputMode="numeric" min={0} step={1} value={active ? value : ""} placeholder="—" onChange={(event) => onChange(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} className={`h-5 w-12 appearance-none border-0 bg-transparent p-0 text-center text-[12px] font-extrabold tabular-nums outline-none focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none ${warning ? "text-amber-900" : "text-[#403730]"}`} aria-label={label} />
      <span className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.05em] text-[#8d8076]">{label}</span>
    </label>
  );
}

function ReviewMetric({ label, value }: { label: string; value: number }) {
  return <div><p className="text-[14px] font-extrabold tabular-nums text-[#302924]">{formatCount(value)}</p><p className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.06em] text-[#756960]">{label}</p></div>;
}
