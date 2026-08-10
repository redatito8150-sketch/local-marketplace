"use client";

import { useMemo, useRef, useState } from "react";
import type { BrandVariant, InventoryMovement } from "@/lib/data/brandPortal";
import { INVENTORY_REASONS, type InventoryAdjustmentType } from "@/lib/inventory/adjustmentValidation";
import { formatDateTime } from "@/lib/format";

export default function InventoryManager({ variants, history, brandSlug }: { variants: BrandVariant[]; history: InventoryMovement[]; brandSlug?: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [type, setType] = useState<InventoryAdjustmentType>("add");
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const operationKey = useRef(crypto.randomUUID());
  const selectedRows = useMemo(() => variants.filter((variant) => selected.includes(variant.variantId)), [selected, variants]);

  const resultingQuantity = (current: number) =>
    type === "add" ? current + amount : type === "remove" ? current - amount : amount;

  async function apply() {
    if (!selectedRows.length) return setError("Select at least one variant");
    if (!reason) return setError("Choose an adjustment reason");
    if (!Number.isInteger(amount) || amount < 0) return setError("Quantity must be a whole, non-negative number");
    if (selectedRows.some((row) => resultingQuantity(row.quantity) < 0)) return setError("Inventory cannot become negative");
    setBusy(true);
    setError("");
    const res = await fetch(`/api/brand-portal/inventory/adjustments${brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": operationKey.current },
      body: JSON.stringify({
        adjustments: selectedRows.map((row) => ({ variantId: row.variantId, type, amount, currentQuantity: row.quantity })),
        reason,
        note,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Inventory adjustment failed");
      setBusy(false);
      return;
    }
    operationKey.current = crypto.randomUUID();
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#e8e0d7] bg-[#fbf8f4] p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold">Action<select value={type} onChange={(event) => setType(event.target.value as InventoryAdjustmentType)} className="mt-1 block rounded-lg border px-3 py-2"><option value="add">Add stock</option><option value="remove">Remove stock</option><option value="set">Set exact stock</option></select></label>
          <label className="text-xs font-semibold">Quantity<input type="number" min={0} step={1} value={amount} onChange={(event) => setAmount(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} className="mt-1 block w-28 rounded-lg border px-3 py-2" /></label>
          <label className="text-xs font-semibold">Reason<select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block rounded-lg border px-3 py-2"><option value="">Select reason</option>{INVENTORY_REASONS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="min-w-48 flex-1 text-xs font-semibold">Note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2" /></label>
          <button type="button" disabled={busy || !selected.length} onClick={apply} className="rounded-lg bg-[#242424] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Apply to {selected.length || 0}</button>
        </div>
        {selectedRows.length > 0 && <p className="mt-3 text-xs text-[#75685f]">Preview: {selectedRows.slice(0, 3).map((row) => `${row.sku}: ${row.quantity} → ${resultingQuantity(row.quantity)}`).join(" · ")}</p>}
        {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead className="border-b bg-[#fbf8f4] text-[10.5px] uppercase text-[#897b70]"><tr><th className="px-4 py-3"><input aria-label="Select all variants" type="checkbox" checked={selected.length === variants.length && variants.length > 0} onChange={(event) => setSelected(event.target.checked ? variants.map((item) => item.variantId) : [])} /></th><th>Product</th><th>Variant / SKU</th><th>Current stock</th><th>Threshold</th><th>Status</th></tr></thead>
          <tbody className="divide-y">{variants.map((variant) => <tr key={variant.variantId}><td className="px-4 py-4"><input aria-label={`Select ${variant.sku}`} type="checkbox" checked={selected.includes(variant.variantId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, variant.variantId] : current.filter((id) => id !== variant.variantId))} /></td><td className="font-bold">{variant.productName}</td><td><p>{variant.optionSummary}</p><code className="text-xs text-[#75685f]">{variant.sku}</code></td><td className="text-lg font-bold">{variant.quantity}</td><td>{variant.lowStockThreshold}</td><td className="capitalize">{variant.stockStatus.replaceAll("_", " ")}</td></tr>)}</tbody>
        </table>
      </div>
      <details className="rounded-xl border border-[#e8e0d7] p-4">
        <summary className="cursor-pointer text-sm font-bold">Inventory History ({history.length})</summary>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead><tr><th className="py-2">Date</th><th>Variant</th><th>Movement</th><th>Before → After</th><th>Reason</th><th>Source</th></tr></thead><tbody className="divide-y">{history.map((movement) => <tr key={movement.id}><td className="py-2">{formatDateTime(movement.createdAt)}</td><td><code>{variants.find((variant) => variant.variantId === movement.variantId)?.sku ?? movement.variantId}</code></td><td className={movement.quantityDelta < 0 ? "text-red-700" : "text-emerald-700"}>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</td><td>{movement.previousQuantity} → {movement.newQuantity}</td><td>{movement.reason}{movement.note ? ` — ${movement.note}` : ""}</td><td>{movement.source}</td></tr>)}</tbody></table></div>
      </details>
    </div>
  );
}
