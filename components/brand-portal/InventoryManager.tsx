"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDownToLine, Check, Download, PackagePlus, RotateCcw } from "lucide-react";
import type { BrandVariant, InventoryMovement } from "@/lib/data/brandPortal";
import { INVENTORY_REASONS, type InventoryAdjustmentType } from "@/lib/inventory/adjustmentValidation";
import { formatDateTime } from "@/lib/format";

type InventoryView = "inventory" | "activity";

const fieldClass = "mt-1.5 h-10 w-full rounded-xl border border-[#e4d9d1] bg-white px-3 text-[12px] text-[#4d433c] outline-none focus-visible:border-[#C85956]/50 focus-visible:ring-4 focus-visible:ring-[#C85956]/8";

function statusMeta(status: BrandVariant["stockStatus"]) {
  if (status === "out_of_stock") return { label: "Out of stock", badge: "bg-red-50 text-red-700", dot: "bg-red-500" };
  if (status === "low_stock") return { label: "Low stock", badge: "bg-amber-50 text-amber-800", dot: "bg-amber-500" };
  return { label: "Healthy", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" };
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    order: "Customer order",
    order_cancellation: "Cancelled order",
    brand_portal: "Brand adjustment",
    product_editor: "Product setup",
    warehouse_transfer: "Warehouse transfer",
  };
  return labels[source] ?? source.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function activityCsv(history: InventoryMovement[], variants: Map<string, BrandVariant>) {
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = history.map((movement) => {
    const variant = variants.get(movement.variantId);
    return [movement.createdAt, variant?.productName ?? "Archived product", variant?.sku ?? movement.variantId, movement.quantityDelta, movement.previousQuantity, movement.newQuantity, movement.reason, movement.note ?? "", sourceLabel(movement.source)].map(escape).join(",");
  });
  return [`Date,Product,SKU,Movement,Before,After,Reason,Note,Source`, ...rows].join("\r\n");
}

function VariantImage({ variant }: { variant: BrandVariant }) {
  return <div className="relative h-14 w-12 flex-none overflow-hidden rounded-xl bg-[#f3ede7]">{variant.image ? <Image src={variant.image} alt={`${variant.productName}${variant.color ? ` in ${variant.color}` : ""}`} fill sizes="48px" className="object-cover" /> : <div className="flex h-full items-center justify-center text-[#b2a49a]"><PackagePlus aria-hidden="true" className="h-4 w-4" /></div>}</div>;
}

function StockInsight({ variant }: { variant: BrandVariant }) {
  if (variant.estimatedDaysRemaining != null) {
    return <><p className={`text-[11px] font-bold tabular-nums ${variant.estimatedDaysRemaining <= 14 ? "text-[#C85956]" : "text-[#4b413a]"}`}>{variant.estimatedDaysRemaining} days left</p><p className="mt-1 text-[9.5px] text-[#94867c]">At the last 30-day pace</p></>;
  }
  return <><p className="text-[11px] font-bold text-[#6f635b]">No recent sales</p><p className="mt-1 text-[9.5px] text-[#94867c]">Stock is stable</p></>;
}

export default function InventoryManager({ variants, allVariants, history, brandSlug, isMahalyPartner, readOnly, view }: {
  variants: BrandVariant[];
  allVariants: BrandVariant[];
  history: InventoryMovement[];
  brandSlug?: string;
  isMahalyPartner: boolean;
  readOnly: boolean;
  view: InventoryView;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [type, setType] = useState<InventoryAdjustmentType>(isMahalyPartner ? "remove" : "add");
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [activityQuery, setActivityQuery] = useState("");
  const [activitySource, setActivitySource] = useState("");
  const operationKey = useRef<string | null>(null);
  const variantById = useMemo(() => new Map(allVariants.map((variant) => [variant.variantId, variant])), [allVariants]);
  const selectableVariantById = useMemo(() => new Map(variants.map((variant) => [variant.variantId, variant])), [variants]);
  const selectedRows = useMemo(() => selected.map((id) => selectableVariantById.get(id)).filter(Boolean) as BrandVariant[], [selected, selectableVariantById]);
  const canAdjustStock = !readOnly && !isMahalyPartner;
  const shipmentHref = (variant?: BrandVariant) => {
    const params = new URLSearchParams();
    if (readOnly && brandSlug) params.set("brand", brandSlug);
    if (variant) {
      params.set("variant", variant.variantId);
      if (variant.suggestedRestock > 0) params.set("qty", String(variant.suggestedRestock));
    }
    return `/brand-portal/warehouse${params.size ? `?${params}` : ""}`;
  };

  const resultingQuantity = (current: number) => type === "add" ? current + amount : type === "remove" ? current - amount : amount;
  const availableReasons = INVENTORY_REASONS.filter((item) => {
    if (type === "add") return !["Damaged Items", "Lost Items"].includes(item);
    if (type === "remove") return !["New Stock Received", "Returned Items"].includes(item);
    return item !== "New Stock Received";
  });

  function validationError() {
    if (!selectedRows.length) return "Select at least one variant.";
    if (!reason) return "Choose why you are changing this stock.";
    if (!Number.isInteger(amount) || amount < 0) return "Quantity must be a whole, non-negative number.";
    if (type !== "set" && amount === 0) return "Enter a quantity greater than zero.";
    if (selectedRows.some((row) => resultingQuantity(row.quantity) < 0)) return "This adjustment would make inventory negative.";
    if (isMahalyPartner && selectedRows.some((row) => resultingQuantity(row.quantity) > row.quantity)) return "Use a Local Warehouse transfer to increase live stock.";
    return "";
  }

  function reviewAdjustment() {
    const nextError = validationError();
    if (nextError) return setError(nextError);
    setError("");
    setConfirming(true);
  }

  async function apply() {
    const nextError = validationError();
    if (nextError) return setError(nextError);
    setBusy(true);
    setError("");
    setSuccess("");
    operationKey.current ??= crypto.randomUUID();
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
      setError(data.error ?? "We couldn't apply this inventory adjustment. Review the values and try again.");
      setBusy(false);
      return;
    }
    operationKey.current = null;
    setBusy(false);
    setConfirming(false);
    setAdjustmentOpen(false);
    setSelected([]);
    setReason("");
    setNote("");
    setSuccess(`${selectedRows.length} ${selectedRows.length === 1 ? "variant" : "variants"} updated.`);
    router.refresh();
  }

  function toggleVariant(variantId: string, checked: boolean) {
    setSuccess("");
    setSelected((current) => checked ? [...new Set([...current, variantId])] : current.filter((id) => id !== variantId));
  }

  function clearSelection() {
    setSelected([]);
    setAdjustmentOpen(false);
    setConfirming(false);
    setError("");
  }

  const filteredHistory = history.filter((movement) => {
    const variant = variantById.get(movement.variantId);
    const query = activityQuery.trim().toLocaleLowerCase();
    if (query && !`${variant?.productName ?? ""} ${variant?.sku ?? movement.variantId} ${movement.reason} ${movement.note ?? ""}`.toLocaleLowerCase().includes(query)) return false;
    return !activitySource || movement.source === activitySource;
  });
  const activitySources = [...new Set(history.map((movement) => movement.source))].sort();

  function downloadActivity() {
    const blob = new Blob([`\uFEFF${activityCsv(filteredHistory, variantById)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${brandSlug ?? "brand"}-inventory-activity.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (view === "activity") {
    return <section className="overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white shadow-[0_10px_34px_rgba(72,50,36,.04)]">
      <div className="border-b border-[#eee7e1] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1"><p className="text-[12px] font-extrabold text-[#302924]">Inventory activity</p><p className="mt-1 text-[10.5px] text-[#8d8076]">Showing {filteredHistory.length} of the latest {history.length} recorded changes.</p></div>
          <label className="min-w-0 lg:w-64"><span className="sr-only">Search inventory activity</span><input value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} autoComplete="off" placeholder="Search product, SKU or reason…" className={`${fieldClass} mt-0`} /></label>
          <label className="lg:w-48"><span className="sr-only">Filter activity source</span><select value={activitySource} onChange={(event) => setActivitySource(event.target.value)} className={`${fieldClass} mt-0`}><option value="">All sources</option>{activitySources.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}</select></label>
          <button type="button" onClick={downloadActivity} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#e3d8d0] px-3 text-[11px] font-bold text-[#5d5148] transition-colors hover:border-[#C85956]/30 hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/10"><Download aria-hidden="true" className="h-3.5 w-3.5" />Export CSV</button>
        </div>
      </div>
      {filteredHistory.length ? <>
        <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] text-left text-[12px]"><thead className="border-b border-[#eee7e1] bg-[#fcfaf8] text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]"><tr><th className="px-5 py-3">Variant</th><th>Change</th><th>Before / after</th><th>Reason</th><th>Source</th><th className="pr-5 text-right">Date</th></tr></thead><tbody className="divide-y divide-[#f0e9e3]">{filteredHistory.map((movement) => {
          const variant = variantById.get(movement.variantId);
          return <tr key={movement.id} className="hover:bg-[#fdfbf9]"><td className="px-5 py-3.5"><p className="font-bold text-[#403730]">{variant?.productName ?? "Archived product"}</p><code className="mt-1 block text-[9.5px] text-[#8d8076]">{variant?.sku ?? movement.variantId}</code></td><td><span className={`font-extrabold tabular-nums ${movement.quantityDelta < 0 ? "text-red-700" : movement.quantityDelta > 0 ? "text-emerald-700" : "text-[#756960]"}`}>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</span></td><td className="font-bold tabular-nums text-[#51473f]">{movement.previousQuantity} → {movement.newQuantity}</td><td className="max-w-[250px] pr-4"><p className="font-semibold text-[#51473f]">{movement.reason}</p>{movement.note && <p className="mt-1 truncate text-[10px] text-[#8d8076]">{movement.note}</p>}</td><td><span className="rounded-md bg-[#f3eee9] px-2 py-1 text-[9.5px] font-bold text-[#756960]">{sourceLabel(movement.source)}</span></td><td className="pr-5 text-right text-[10px] text-[#8d8076]">{formatDateTime(movement.createdAt)}</td></tr>;
        })}</tbody></table></div>
        <div className="divide-y divide-[#eee7e1] md:hidden">{filteredHistory.map((movement) => {
          const variant = variantById.get(movement.variantId);
          return <article key={movement.id} className="px-4 py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-bold text-[#403730]">{variant?.productName ?? "Archived product"}</p><code className="mt-1 block truncate text-[9px] text-[#8d8076]">{variant?.sku ?? movement.variantId}</code></div><span className={`text-[13px] font-extrabold tabular-nums ${movement.quantityDelta < 0 ? "text-red-700" : movement.quantityDelta > 0 ? "text-emerald-700" : "text-[#756960]"}`}>{movement.quantityDelta > 0 ? "+" : ""}{movement.quantityDelta}</span></div><div className="mt-3 flex items-center justify-between gap-3 text-[10px]"><p className="font-semibold text-[#51473f]">{movement.reason}</p><p className="tabular-nums text-[#8d8076]">{movement.previousQuantity} → {movement.newQuantity}</p></div><div className="mt-2 flex items-center justify-between gap-3 text-[9.5px] text-[#94867c]"><span>{sourceLabel(movement.source)}</span><span>{formatDateTime(movement.createdAt)}</span></div></article>;
        })}</div>
      </> : <div className="px-5 py-14 text-center"><RotateCcw aria-hidden="true" className="mx-auto h-6 w-6 text-[#b8aaa0]" /><p className="mt-3 text-[12px] font-bold text-[#403730]">No matching activity</p><p className="mt-1 text-[10.5px] text-[#8d8076]">Clear the search or choose another source.</p></div>}
    </section>;
  }

  return <div className="space-y-3">
    {isMahalyPartner && !readOnly && <section className="flex flex-col gap-3 rounded-2xl border border-[#e5ddd6] bg-[#f6f2ee] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><ArrowDownToLine aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-[#6d6057]" /><div><p className="text-[11.5px] font-bold text-[#403730]">Zakhnook fulfils this inventory</p><p className="mt-1 text-[10px] leading-4 text-[#81746b]">This page is read-only. Send new units through Shipments & Transfers; available stock updates after receiving.</p></div></div><Link href={shipmentHref()} className="inline-flex h-9 flex-none items-center justify-center rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white transition-colors hover:bg-[#b84e4b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/15">Create shipment</Link></section>}
    {readOnly && <section className="rounded-2xl border border-[#e5ddd6] bg-[#f6f2ee] px-4 py-3 text-[10.5px] text-[#756960]">Admin preview is read-only. Switch back to your own brand account to adjust inventory.</section>}
    <div aria-live="polite">{success && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[11px] font-bold text-emerald-800"><Check aria-hidden="true" className="h-4 w-4" />{success}</div>}</div>

    {selectedRows.length > 0 && canAdjustStock && <section className="sticky top-3 z-20 overflow-hidden rounded-2xl border border-[#d9cec6] bg-[#fffdfb]/95 shadow-[0_16px_45px_rgba(72,50,36,.13)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-3"><span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-[#C85956] px-2 text-[11px] font-extrabold tabular-nums text-white">{selectedRows.length}</span><div><p className="text-[11.5px] font-bold text-[#403730]">{selectedRows.length === 1 ? "Variant selected" : "Variants selected"}</p><p className="text-[9.5px] text-[#8d8076]">Adjust only the variants you checked.</p></div></div><div className="flex items-center gap-2"><button type="button" onClick={clearSelection} className="h-9 px-2 text-[10.5px] font-bold text-[#8d8076] hover:text-[#403730]">Clear</button><button type="button" onClick={() => { setAdjustmentOpen((open) => !open); setConfirming(false); setError(""); }} className="h-9 rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white transition-colors hover:bg-[#b84e4b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/15">{adjustmentOpen ? "Close adjustment" : "Adjust stock"}</button></div></div>
      {adjustmentOpen && <div className="border-t border-[#e8dfd8] bg-[#fcfaf8] p-4">
        {!confirming ? <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[150px_130px_210px_minmax(220px,1fr)_auto] xl:items-end">
          <label><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Action</span><select value={type} onChange={(event) => { setType(event.target.value as InventoryAdjustmentType); setReason(""); setError(""); }} className={fieldClass}>{!isMahalyPartner && <option value="add">Add stock</option>}<option value="remove">Remove stock</option><option value="set">Set exact stock</option></select></label>
          <label><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Quantity</span><input type="number" inputMode="numeric" min={0} step={1} value={amount} onChange={(event) => setAmount(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} className={`${fieldClass} tabular-nums`} /></label>
          <label><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Reason</span><select value={reason} onChange={(event) => setReason(event.target.value)} className={fieldClass}><option value="">Choose a reason…</option>{availableReasons.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Note <span className="font-medium normal-case tracking-normal">(optional)</span></span><input value={note} onChange={(event) => setNote(event.target.value)} autoComplete="off" placeholder="Add useful context…" className={fieldClass} /></label>
          <button type="button" onClick={reviewAdjustment} className="h-10 rounded-xl bg-[#242424] px-4 text-[10.5px] font-bold text-white transition-colors hover:bg-[#3a332e] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#242424]/10">Review change</button>
        </div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#756960]">{selectedRows.slice(0, 4).map((row) => <span key={row.variantId}><code>{row.sku}</code>: <strong className="tabular-nums text-[#403730]">{row.quantity} → {resultingQuantity(row.quantity)}</strong></span>)}{selectedRows.length > 4 && <span>+{selectedRows.length - 4} more</span>}</div></> : <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex gap-3">{type === "add" ? <PackagePlus aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-emerald-700" /> : <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 flex-none text-amber-700" />}<div><p className="text-[12px] font-bold text-[#403730]">Confirm {type === "set" ? "exact stock" : `${type} stock`} for {selectedRows.length} {selectedRows.length === 1 ? "variant" : "variants"}</p><p className="mt-1 text-[10px] text-[#81746b]">Reason: {reason}{note ? ` · ${note}` : ""}. Every change will be recorded in Activity.</p></div></div><div className="flex gap-2"><button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-9 rounded-xl border border-[#ddd2ca] bg-white px-4 text-[10.5px] font-bold text-[#5d5148] hover:bg-[#f8f4f0]">Back</button><button type="button" onClick={apply} disabled={busy} className="h-9 rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-50">{busy ? "Applying…" : "Confirm adjustment"}</button></div></div>}
        {error && <p role="alert" className="mt-3 text-[10.5px] font-bold text-red-700">{error}</p>}
      </div>}
    </section>}

    <section className="overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white shadow-[0_10px_34px_rgba(72,50,36,.04)]">
      <div className="flex items-center justify-between border-b border-[#eee7e1] px-4 py-3.5 sm:px-5"><div><p className="text-[11.5px] font-extrabold text-[#302924]">Variant stock</p><p className="mt-1 text-[10px] text-[#8d8076]">{variants.length} matching {variants.length === 1 ? "variant" : "variants"}</p></div>{variants.some((variant) => variant.suggestedRestock > 0) && <p className="hidden text-[9.5px] font-bold text-[#C85956] sm:block">Restock suggestions use 30-day sales + your alert buffer</p>}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[940px] text-left text-[12px]"><thead className="border-b border-[#eee7e1] bg-[#fcfaf8] text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]"><tr>{canAdjustStock && <th className="w-12 px-5 py-3"><input aria-label="Select all visible variants" type="checkbox" className="h-4 w-4 accent-[#C85956]" checked={selected.length === variants.length && variants.length > 0} onChange={(event) => setSelected(event.target.checked ? variants.map((item) => item.variantId) : [])} /></th>}<th className={!canAdjustStock ? "pl-5" : undefined}>Product</th><th>Variant / SKU</th><th>{isMahalyPartner ? "At Zakhnook" : "Available"}</th><th>Sold 30d</th><th>Stock cover</th><th className="pr-5">{isMahalyPartner ? "Status / action" : "Status"}</th></tr></thead><tbody className="divide-y divide-[#f0e9e3]">{variants.map((variant) => {
        const status = statusMeta(variant.stockStatus);
        const checked = selected.includes(variant.variantId);
        return <tr key={variant.variantId} className={`transition-colors ${checked ? "bg-[#fff7f5]" : "hover:bg-[#fdfbf9]"}`}>{canAdjustStock && <td className="px-5 py-3.5"><input aria-label={`Select ${variant.sku}`} type="checkbox" className="h-4 w-4 accent-[#C85956]" checked={checked} onChange={(event) => toggleVariant(variant.variantId, event.target.checked)} /></td>}<td className={`py-3.5 ${!canAdjustStock ? "pl-5" : ""}`}><div className="flex min-w-0 items-center gap-3"><VariantImage variant={variant} /><div className="min-w-0"><p className="max-w-[180px] truncate font-bold text-[#403730]">{variant.productName}</p><p className="mt-1 text-[9.5px] text-[#94867c]">Alert at {variant.lowStockThreshold} units</p></div></div></td><td><p className="max-w-[220px] truncate font-semibold text-[#51473f]">{variant.color || "No color"} · {variant.size || "One size"}</p><code className="mt-1 block max-w-[220px] truncate text-[9px] text-[#94867c]">{variant.sku}</code></td><td><p className="text-[19px] font-extrabold tabular-nums tracking-[-0.03em] text-[#242424]">{variant.quantity}</p><p className="text-[9.5px] text-[#94867c]">units</p></td><td><p className="text-[13px] font-extrabold tabular-nums text-[#403730]">{variant.soldLast30Days}</p><p className="mt-1 text-[9.5px] text-[#94867c]">units</p></td><td><StockInsight variant={variant} /></td><td className="pr-5"><span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9.5px] font-bold ${status.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}</span>{variant.suggestedRestock > 0 && <p className="mt-1.5 text-[9.5px] font-bold text-[#C85956]">Suggested +{variant.suggestedRestock}</p>}{isMahalyPartner && !readOnly && <Link href={shipmentHref(variant)} className="mt-2 inline-flex text-[9.5px] font-bold text-[#C85956] underline-offset-4 hover:underline">Send stock</Link>}</td></tr>;
      })}</tbody></table></div>
      <div className="divide-y divide-[#eee7e1] md:hidden">{variants.map((variant) => {
        const status = statusMeta(variant.stockStatus);
        const checked = selected.includes(variant.variantId);
        return <article key={variant.variantId} className={`p-4 ${checked ? "bg-[#fff7f5]" : ""}`}><div className="flex items-start gap-3">{canAdjustStock && <input aria-label={`Select ${variant.sku}`} type="checkbox" className="mt-4 h-5 w-5 flex-none accent-[#C85956]" checked={checked} onChange={(event) => toggleVariant(variant.variantId, event.target.checked)} />}<VariantImage variant={variant} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-bold text-[#403730]">{variant.productName}</p><p className="mt-1 truncate text-[10px] text-[#81746b]">{variant.color || "No color"} · {variant.size || "One size"}</p></div><span className={`inline-flex flex-none items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] font-bold ${status.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}</span></div><code className="mt-1.5 block truncate text-[8.5px] text-[#9a8c82]">{variant.sku}</code></div></div><div className="mt-3 grid grid-cols-3 divide-x divide-[#eee7e1] rounded-xl bg-[#faf7f4] py-2.5 text-center"><div><p className="text-[15px] font-extrabold tabular-nums text-[#242424]">{variant.quantity}</p><p className="mt-0.5 text-[8.5px] text-[#94867c]">{isMahalyPartner ? "At Zakhnook" : "Available"}</p></div><div><p className="text-[15px] font-extrabold tabular-nums text-[#242424]">{variant.soldLast30Days}</p><p className="mt-0.5 text-[8.5px] text-[#94867c]">Sold 30d</p></div><div><p className={`text-[13px] font-extrabold tabular-nums ${variant.estimatedDaysRemaining != null && variant.estimatedDaysRemaining <= 14 ? "text-[#C85956]" : "text-[#242424]"}`}>{variant.estimatedDaysRemaining != null ? `${variant.estimatedDaysRemaining}d` : "—"}</p><p className="mt-0.5 text-[8.5px] text-[#94867c]">Stock cover</p></div></div><div className="mt-2 flex items-center justify-end gap-3">{variant.suggestedRestock > 0 && <p className="text-[9.5px] font-bold text-[#C85956]">Suggested restock: +{variant.suggestedRestock}</p>}{isMahalyPartner && !readOnly && <Link href={shipmentHref(variant)} className="inline-flex h-8 items-center rounded-lg bg-[#C85956] px-3 text-[9.5px] font-bold text-white">Send stock</Link>}</div></article>;
      })}</div>
    </section>
  </div>;
}
