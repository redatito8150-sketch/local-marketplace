"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { DashboardEmptyState, DashboardPanel, dashboardButtonPrimary, dashboardButtonSecondary } from "@/components/dashboard/DashboardUI";
import type { WarehouseTransferRow, WarehouseVariantRow } from "@/lib/data/warehouse";

function withBrand(path: string, brandParam?: string): string {
  return brandParam ? `${path}?brand=${encodeURIComponent(brandParam)}` : path;
}

const STATUS_BADGE: Record<WarehouseTransferRow["status"], { label: string; className: string; icon: React.ElementType }> = {
  pending: { label: "Pending review", className: "bg-amber-50 text-amber-700", icon: Clock },
  received: { label: "Received", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700", icon: XCircle },
};

export default function WarehouseExperience({
  variants,
  transfers,
  brandParam,
  initialVariantId,
  initialQuantity,
}: {
  variants: WarehouseVariantRow[];
  transfers: WarehouseTransferRow[];
  brandParam?: string;
  initialVariantId?: string;
  initialQuantity?: number;
}) {
  const router = useRouter();
  const initialVariant = variants.find((variant) => variant.variantId === initialVariantId);
  const initialAvailable = initialVariant ? Math.max(0, initialVariant.brandStockQuantity - initialVariant.pendingRequestedQty) : 0;
  const initialRequested = initialVariant && Number.isInteger(initialQuantity) && (initialQuantity ?? 0) > 0
    ? Math.min(initialAvailable, initialQuantity!)
    : 0;
  const orderedVariants = useMemo(() => initialVariantId
    ? [...variants].sort((left, right) => Number(right.variantId === initialVariantId) - Number(left.variantId === initialVariantId))
    : variants, [initialVariantId, variants]);
  const [workspaceView, setWorkspaceView] = useState<"send" | "return" | "history">("send");
  const [stockDrafts, setStockDrafts] = useState<Record<string, number>>({});
  const [requestQty, setRequestQty] = useState<Record<string, number>>(() => initialVariant && initialRequested > 0 ? { [initialVariant.variantId]: initialRequested } : {});
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialVariant && initialRequested > 0 ? [initialVariant.variantId] : []));
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const returnOperationKey = useRef(crypto.randomUUID());
  const transferOperationKey = useRef(crypto.randomUUID());
  const [returnSelected, setReturnSelected] = useState<Set<string>>(new Set());
  const [savingStock, setSavingStock] = useState(false);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [transferNote, setTransferNote] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stockFor = (v: WarehouseVariantRow) => stockDrafts[v.variantId] ?? v.brandStockQuantity;
  const availableToRequest = (v: WarehouseVariantRow) => Math.max(0, stockFor(v) - v.pendingRequestedQty);
  const availableToReturn = (v: WarehouseVariantRow) => Math.max(0, v.quantity - v.pendingReturnQty);

  async function saveStockCounts() {
    const updates = Object.entries(stockDrafts).map(([variantId, brandStockQuantity]) => ({ variantId, brandStockQuantity }));
    if (!updates.length) return;
    setSavingStock(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(withBrand("/api/brand-portal/warehouse/stock", brandParam), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setMessage("Warehouse stock counts saved.");
      setStockDrafts({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingStock(false);
    }
  }

  async function submitReturn() {
    const items = [...returnSelected]
      .map((variantId) => ({ variantId, requestedQty: returnQty[variantId] ?? 0 }))
      .filter((item) => item.requestedQty > 0);
    if (!items.length) {
      setError("Enter a quantity for at least one selected variant to return.");
      return;
    }
    setSubmittingReturn(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(withBrand("/api/brand-portal/warehouse/returns", brandParam), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": returnOperationKey.current,
        },
        body: JSON.stringify({ items, note: returnNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit return request");
      setMessage("Return request submitted — Zakhnook's warehouse will review it.");
      setReturnSelected(new Set());
      setReturnQty({});
      setReturnNote("");
      returnOperationKey.current = crypto.randomUUID();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit return request");
    } finally {
      setSubmittingReturn(false);
    }
  }

  async function submitTransfer() {
    const items = [...selected]
      .map((variantId) => ({ variantId, requestedQty: requestQty[variantId] ?? 0 }))
      .filter((item) => item.requestedQty > 0);
    if (!items.length) {
      setError("Enter a quantity for at least one selected variant.");
      return;
    }
    setSubmittingTransfer(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(withBrand("/api/brand-portal/warehouse/transfers", brandParam), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": transferOperationKey.current,
        },
        body: JSON.stringify({ items, note: transferNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit transfer");
      setMessage("Transfer request submitted — Zakhnook's warehouse will review it.");
      setSelected(new Set());
      setRequestQty({});
      setTransferNote("");
      transferOperationKey.current = crypto.randomUUID();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit transfer");
    } finally {
      setSubmittingTransfer(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] text-red-800">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[12.5px] text-emerald-800">{message}</div>}

      <nav aria-label="Shipment workspace" className="flex w-fit items-center gap-1 rounded-xl bg-[#eee7e1] p-1">
        {([[
          "send", "Send stock"
        ], ["return", "Return stock"], ["history", "History"]] as const).map(([key, label]) => <button key={key} type="button" onClick={() => setWorkspaceView(key)} aria-pressed={workspaceView === key} className={`rounded-lg px-4 py-2 text-[11px] font-bold transition-colors ${workspaceView === key ? "bg-white text-[#242424] shadow-[0_1px_4px_rgba(72,50,36,.09)]" : "text-[#776a61] hover:text-[#242424]"}`}>{label}</button>)}
      </nav>

      {workspaceView === "send" && initialVariant && <div className="rounded-2xl border border-[#eadfd7] bg-[#fff8f6] px-4 py-3 text-[11px] text-[#756960]">
        <span className="font-bold text-[#403730]">Selected from Inventory:</span> {initialVariant.productName}{initialVariant.optionLabel ? ` — ${initialVariant.optionLabel}` : ""}.
        {initialRequested > 0 ? ` Suggested quantity ${initialRequested} is ready for review.` : " Register stock held by your brand before submitting this shipment."}
      </div>}

      {workspaceView !== "history" && <div id="shipment-variants" className="scroll-mt-6"><DashboardPanel
        title={workspaceView === "send" ? "Choose stock to send" : "Choose stock to return"}
        description={workspaceView === "send" ? "Select the variants leaving your location for Zakhnook. They become sellable only after receiving." : "Select units currently held by Zakhnook that you want returned to your brand."}
        action={
          workspaceView === "send" ? <button type="button" onClick={saveStockCounts} disabled={savingStock || Object.keys(stockDrafts).length === 0} className={dashboardButtonSecondary}>
            {savingStock ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Confirm held quantities
          </button> : undefined
        }
      >
        {variants.length === 0 ? (
          <DashboardEmptyState title="No variants yet" description="Create products and their variants first — then come back here to register your stock and request a transfer." />
        ) : (
          <>
          <div className="space-y-3 p-3 md:hidden">
            {orderedVariants.map((variant) => {
              const sendSelected = selected.has(variant.variantId);
              const returnIsSelected = returnSelected.has(variant.variantId);
              const sendMax = availableToRequest(variant);
              const returnMax = availableToReturn(variant);
              return <article key={variant.variantId} className={`rounded-2xl border p-4 ${initialVariantId === variant.variantId ? "border-[#C85956]/35 bg-[#fff8f6]" : "border-[#eadfd7] bg-white"}`}>
                <div className="flex items-start gap-3">
                  {workspaceView === "send" ? <input type="checkbox" aria-label={`Select ${variant.productName} for transfer`} className="mt-1 h-5 w-5 accent-[#C85956]" checked={sendSelected} disabled={sendMax === 0} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(variant.variantId); else next.delete(variant.variantId); setSelected(next); }} /> : <input type="checkbox" aria-label={`Select ${variant.productName} for return`} className="mt-1 h-5 w-5 accent-[#C85956]" checked={returnIsSelected} disabled={returnMax === 0} onChange={(event) => { const next = new Set(returnSelected); if (event.target.checked) next.add(variant.variantId); else next.delete(variant.variantId); setReturnSelected(next); }} />}
                  <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-bold text-[#403730]">{variant.productName}</p><p className="mt-1 truncate text-[10px] text-[#81746b]">{variant.optionLabel || "Default variant"}</p><code className="mt-1 block truncate text-[8.5px] text-[#9a8c82]">{variant.sku}</code></div>
                  <div className="text-right"><p className="text-[17px] font-extrabold tabular-nums text-[#242424]">{variant.quantity}</p><p className="text-[8.5px] text-[#94867c]">At Zakhnook</p></div>
                </div>
                {workspaceView === "send" ? <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#8d8076]">Held by your brand<input type="number" min={0} step={1} value={stockFor(variant)} onChange={(event) => setStockDrafts((current) => ({ ...current, [variant.variantId]: Math.max(0, Math.trunc(Number(event.target.value) || 0)) }))} className="mt-1.5 h-10 w-full rounded-xl border border-[#e4d9d1] px-3 text-[12px] font-semibold tabular-nums outline-none focus:border-[#C85956]/50" /></label><label className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#8d8076]">Send quantity<input type="number" min={0} max={sendMax} step={1} disabled={!sendSelected} value={requestQty[variant.variantId] ?? ""} onChange={(event) => setRequestQty((current) => ({ ...current, [variant.variantId]: Math.max(0, Math.min(sendMax, Math.trunc(Number(event.target.value) || 0))) }))} className="mt-1.5 h-10 w-full rounded-xl border border-[#e4d9d1] px-3 text-[12px] font-semibold tabular-nums outline-none focus:border-[#C85956]/50 disabled:bg-[#f7f3ef]" /></label></div> : <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-[#faf7f4] p-3"><div><p className="text-[15px] font-extrabold tabular-nums text-[#242424]">{returnMax}</p><p className="text-[8.5px] text-[#94867c]">Available to return</p></div><label className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#8d8076]">Return quantity<input type="number" min={0} max={returnMax} step={1} disabled={!returnIsSelected} value={returnQty[variant.variantId] ?? ""} onChange={(event) => setReturnQty((current) => ({ ...current, [variant.variantId]: Math.max(0, Math.min(returnMax, Math.trunc(Number(event.target.value) || 0))) }))} className="mt-1.5 h-10 w-full rounded-xl border border-[#e4d9d1] bg-white px-3 text-[12px] font-semibold tabular-nums outline-none focus:border-[#C85956]/50 disabled:bg-[#f7f3ef]" /></label></div>}
              </article>;
            })}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-3 py-2.5">Product / Variant</th>
                  <th className="px-3 py-2.5">At Zakhnook</th>
                  {workspaceView === "send" ? <><th className="px-3 py-2.5">Held by your brand</th><th className="px-3 py-2.5">Already pending</th><th className="px-3 py-2.5">Send qty</th></> : <><th className="px-3 py-2.5">Available to return</th><th className="px-3 py-2.5">Return qty</th></>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orderedVariants.map((v) => {
                  const isSelected = selected.has(v.variantId);
                  const max = availableToRequest(v);
                  const isReturnSelected = returnSelected.has(v.variantId);
                  const returnMax = availableToReturn(v);
                  return (
                    <tr key={v.variantId}>
                      <td className="px-3 py-2.5">{workspaceView === "send" ? <input type="checkbox" aria-label={`Select ${v.productName} for transfer`} checked={isSelected} disabled={max === 0} onChange={(e) => { const next = new Set(selected); if (e.target.checked) next.add(v.variantId); else next.delete(v.variantId); setSelected(next); }} /> : <input type="checkbox" aria-label={`Select ${v.productName} for return`} checked={isReturnSelected} disabled={returnMax === 0} onChange={(e) => { const next = new Set(returnSelected); if (e.target.checked) next.add(v.variantId); else next.delete(v.variantId); setReturnSelected(next); }} />}</td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-slate-900">{v.productName}</span>
                        {v.optionLabel && <span className="ml-1.5 text-slate-500">— {v.optionLabel}</span>}
                        <br />
                        <code className="text-[11px] text-slate-400">{v.sku}</code>
                      </td>
                      <td className="px-3 py-2.5 text-slate-900">{v.quantity}</td>
                      {workspaceView === "send" ? <><td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          aria-label={`Your warehouse stock for ${v.productName}`}
                          value={stockFor(v)}
                          onChange={(e) => setStockDrafts((prev) => ({ ...prev, [v.variantId]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))}
                          className="w-20 rounded border border-slate-200 px-2 py-1 text-[12.5px] outline-none focus:border-slate-400"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{v.pendingRequestedQty}</td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={max}
                          step={1}
                          aria-label={`Requested transfer quantity for ${v.productName}`}
                          disabled={!isSelected}
                          value={requestQty[v.variantId] ?? ""}
                          placeholder={max > 0 ? `up to ${max}` : "0"}
                          onChange={(e) => setRequestQty((prev) => ({ ...prev, [v.variantId]: Math.max(0, Math.min(max, Math.trunc(Number(e.target.value) || 0))) }))}
                          className="w-20 rounded border border-slate-200 px-2 py-1 text-[12.5px] outline-none focus:border-slate-400 disabled:bg-slate-50"
                        />
                      </td></> : <><td className="px-3 py-2.5 text-slate-500">{returnMax}</td><td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={returnMax}
                          step={1}
                          aria-label={`Requested return quantity for ${v.productName}`}
                          disabled={!isReturnSelected}
                          value={returnQty[v.variantId] ?? ""}
                          placeholder={returnMax > 0 ? `up to ${returnMax}` : "0"}
                          onChange={(e) => setReturnQty((prev) => ({ ...prev, [v.variantId]: Math.max(0, Math.min(returnMax, Math.trunc(Number(e.target.value) || 0))) }))}
                          className="w-20 rounded border border-slate-200 px-2 py-1 text-[12.5px] outline-none focus:border-slate-400 disabled:bg-slate-50"
                        />
                      </td></>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div></>
        )}
      </DashboardPanel></div>}

      {workspaceView === "send" && variants.length > 0 && (
        <DashboardPanel title="Request a transfer (اذن صرف مخزن)">
          <div className="space-y-3 px-5 py-4">
            <textarea
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              placeholder="Optional note for Zakhnook's warehouse team (e.g. delivery date, packaging notes)"
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
            />
            <button type="button" onClick={submitTransfer} disabled={submittingTransfer || selected.size === 0} className={dashboardButtonPrimary}>
              {submittingTransfer ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Submit transfer request
            </button>
          </div>
        </DashboardPanel>
      )}

      {workspaceView === "return" && variants.length > 0 && (
        <DashboardPanel title="Request a return (رجوع من المخزن المحلي)" description="Ask Zakhnook's warehouse to hand back stock it's currently holding for you — checked off in the 'Return qty' column above.">
          <div className="space-y-3 px-5 py-4">
            <textarea
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              placeholder="Optional note (e.g. reason for the return, pickup preference)"
              rows={2}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
            />
            <button type="button" onClick={submitReturn} disabled={submittingReturn || returnSelected.size === 0} className={dashboardButtonSecondary}>
              {submittingReturn ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Submit return request
            </button>
          </div>
        </DashboardPanel>
      )}

      {workspaceView === "history" && <DashboardPanel title="Transfer history">
        {transfers.length === 0 ? (
          <DashboardEmptyState title="No transfers yet" description="Requested transfers and their outcomes will show up here." />
        ) : (
          <div className="divide-y divide-slate-100">
            {transfers.map((t) => {
              const badge = STATUS_BADGE[t.status];
              const Icon = badge.icon;
              const hasDiscrepancy = t.items.some((i) => (i.damagedQty ?? 0) > 0 || (i.missingQty ?? 0) > 0);
              return (
                <div key={t.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {t.direction === "to_brand" ? "Return" : "Transfer"}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>
                      <Icon className="h-3 w-3" /> {badge.label}
                    </span>
                    <span className="text-[12px] text-slate-500">{new Date(t.requestedAt).toLocaleString()}</span>
                    {hasDiscrepancy && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> Discrepancy reported
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1 text-[12.5px] text-slate-700">
                    {t.items.map((item) => (
                      <li key={item.id}>
                        {item.productName}
                        {item.optionLabel ? ` — ${item.optionLabel}` : ""}: requested {item.requestedQty}
                        {item.receivedOkQty != null && (
                          <span className="text-slate-500">
                            {" "}— received {item.receivedOkQty}
                            {(item.damagedQty ?? 0) > 0 ? `, damaged ${item.damagedQty}` : ""}
                            {(item.missingQty ?? 0) > 0 ? `, missing ${item.missingQty}` : ""}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {t.receivingNote && <p className="mt-2 text-[12px] italic text-slate-500">Note from Zakhnook: {t.receivingNote}</p>}
                </div>
              );
            })}
          </div>
        )}
      </DashboardPanel>}
    </div>
  );
}
