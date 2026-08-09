"use client";

import { useRef, useState } from "react";
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
}: {
  variants: WarehouseVariantRow[];
  transfers: WarehouseTransferRow[];
  brandParam?: string;
}) {
  const [stockDrafts, setStockDrafts] = useState<Record<string, number>>({});
  const [requestQty, setRequestQty] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      setMessage("Return request submitted — Mahaly's warehouse will review it.");
      setReturnSelected(new Set());
      setReturnQty({});
      setReturnNote("");
      returnOperationKey.current = crypto.randomUUID();
      window.location.reload();
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
      setMessage("Transfer request submitted — Mahaly's warehouse will review it.");
      setSelected(new Set());
      setRequestQty({});
      setTransferNote("");
      transferOperationKey.current = crypto.randomUUID();
      window.location.reload();
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

      <DashboardPanel
        title="Your variants"
        description="Declare what you physically hold, then select what to include in a transfer request. Live site stock only changes once Mahaly confirms receipt."
        action={
          <button type="button" onClick={saveStockCounts} disabled={savingStock || Object.keys(stockDrafts).length === 0} className={dashboardButtonSecondary}>
            {savingStock ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Save stock counts
          </button>
        }
      >
        {variants.length === 0 ? (
          <DashboardEmptyState title="No variants yet" description="Create products and their variants first — then come back here to register your stock and request a transfer." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-3 py-2.5">Product / Variant</th>
                  <th className="px-3 py-2.5">Live site stock</th>
                  <th className="px-3 py-2.5">Your warehouse stock</th>
                  <th className="px-3 py-2.5">Pending transfer</th>
                  <th className="px-3 py-2.5">Request qty</th>
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-3 py-2.5">Return qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {variants.map((v) => {
                  const isSelected = selected.has(v.variantId);
                  const max = availableToRequest(v);
                  const isReturnSelected = returnSelected.has(v.variantId);
                  const returnMax = availableToReturn(v);
                  return (
                    <tr key={v.variantId}>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${v.productName} for transfer`}
                          checked={isSelected}
                          disabled={max === 0}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(v.variantId);
                            else next.delete(v.variantId);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-slate-900">{v.productName}</span>
                        {v.optionLabel && <span className="ml-1.5 text-slate-500">— {v.optionLabel}</span>}
                        <br />
                        <code className="text-[11px] text-slate-400">{v.sku}</code>
                      </td>
                      <td className="px-3 py-2.5 text-slate-900">{v.quantity}</td>
                      <td className="px-3 py-2.5">
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
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Select ${v.productName} for return`}
                          checked={isReturnSelected}
                          disabled={returnMax === 0}
                          onChange={(e) => {
                            const next = new Set(returnSelected);
                            if (e.target.checked) next.add(v.variantId);
                            else next.delete(v.variantId);
                            setReturnSelected(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardPanel>

      {variants.length > 0 && (
        <DashboardPanel title="Request a transfer (اذن صرف مخزن)">
          <div className="space-y-3 px-5 py-4">
            <textarea
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              placeholder="Optional note for Mahaly's warehouse team (e.g. delivery date, packaging notes)"
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

      {variants.length > 0 && (
        <DashboardPanel title="Request a return (رجوع من المخزن المحلي)" description="Ask Mahaly's warehouse to hand back stock it's currently holding for you — checked off in the 'Return qty' column above.">
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

      <DashboardPanel title="Transfer history">
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
                  {t.receivingNote && <p className="mt-2 text-[12px] italic text-slate-500">Note from Mahaly: {t.receivingNote}</p>}
                </div>
              );
            })}
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}
