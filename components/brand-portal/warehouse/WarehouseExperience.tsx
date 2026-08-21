"use client";

import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowDownToLine, ArrowLeft, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight, Loader2, RotateCcw, Search, X } from "lucide-react";
import DateRangePicker from "@/components/ui/DateRangePicker";
import { DashboardEmptyState } from "@/components/dashboard/DashboardUI";
import { DashboardFilterField, DashboardMoreFilters, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { BrandMark, formatCount } from "@/components/admin/inventory/shared";
import { WAREHOUSE_STATUS_META, warehouseDocumentLabel, warehouseStatusMeta } from "@/components/admin/warehouse/warehouseUi";
import type { WarehouseTransferRow, WarehouseVariantRow } from "@/lib/data/warehouse";
import { formatDateTime } from "@/lib/format";
import ColorSwatch from "@/components/admin/ColorSwatch";

type DocumentFilter = "all" | "requested" | "preparing" | "in_transit" | "action_required" | "received";
type DirectionFilter = "all" | WarehouseTransferRow["direction"];
type ReturnColorGroup = { label: string; variants: Array<{ variant: WarehouseVariantRow; size: string }> };
type ReturnProductGroup = { productId: string; productName: string; productImage: string | null; colors: ReturnColorGroup[] };

const DOCUMENT_PAGE_SIZE = 12;
const RETURN_PRODUCT_PAGE_SIZE = 8;
type DocumentSort = "document-asc" | "document-desc" | "requested-asc" | "requested-desc" | "status-asc" | "status-desc" | "date-asc" | "date-desc";
type DocumentSortField = "document" | "requested" | "status" | "date";

function DocumentSortButton({ field, label, hint, sort, onSort }: { field: DocumentSortField; label: string; hint?: string; sort: DocumentSort; onSort: (field: DocumentSortField) => void }) {
  const active = sort.startsWith(`${field}-`);
  const Icon = active ? sort.endsWith("asc") ? ArrowUp : ArrowDown : ArrowUpDown;
  return <button type="button" onClick={() => onSort(field)} className="group inline-flex items-center gap-1.5 text-left outline-none transition-colors hover:text-[#C85956] focus-visible:ring-2 focus-visible:ring-[#C85956]/25" aria-label={`Sort by ${label}${active ? sort.endsWith("asc") ? ", ascending" : ", descending" : ""}`}>
    <span>{label}{hint ? <small className="mt-0.5 block text-[8px] font-medium normal-case tracking-normal text-[#9a8d83]">{hint}</small> : null}</span>
    <Icon aria-hidden="true" className={`h-3 w-3 transition-colors ${active ? "text-[#C85956]" : "text-[#b1a49a] group-hover:text-[#C85956]"}`} />
  </button>;
}

function withBrand(path: string, brandParam?: string): string {
  return brandParam ? `${path}?brand=${encodeURIComponent(brandParam)}` : path;
}

function hasOpenDocumentIssue(transfer: WarehouseTransferRow): boolean {
  return transfer.reconciliationStatus === "open_discrepancy" || transfer.reconciliationStatus === "partially_settled";
}

function documentNumber(transfer: WarehouseTransferRow): string {
  return transfer.documentNumber ?? `#${transfer.id.slice(0, 8).toUpperCase()}`;
}

function Pager({ page, count, pageSize, onPage }: { page: number; count: number; pageSize: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (pages <= 1) return null;
  return <nav aria-label="List pages" className="flex items-center justify-between border-t border-[#e3dbd4] px-4 py-3 sm:px-5">
    <p className="text-[10px] text-[#91837a]">Page <strong className="tabular-nums text-[#51473f]">{page}</strong> of {pages}</p>
    <div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-8 rounded-lg bg-[#f4efea] px-3 text-[10px] font-bold text-[#5d5148] transition hover:bg-[#ebe3dc] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35">Previous</button><button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-8 rounded-lg bg-[#242424] px-3 text-[10px] font-bold text-white transition hover:bg-[#3a332e] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35">Next</button></div>
  </nav>;
}

function DocumentList({ transfers, brandParam }: { transfers: WarehouseTransferRow[]; brandParam?: string }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<DocumentSort>("date-desc");
  const sortedTransfers = useMemo(() => [...transfers].sort((first, second) => {
    const firstUnits = first.items.reduce((sum, item) => sum + item.requestedQty, 0);
    const secondUnits = second.items.reduce((sum, item) => sum + item.requestedQty, 0);
    if (sort === "document-asc") return documentNumber(first).localeCompare(documentNumber(second), undefined, { numeric: true });
    if (sort === "document-desc") return documentNumber(second).localeCompare(documentNumber(first), undefined, { numeric: true });
    if (sort === "requested-asc") return firstUnits - secondUnits;
    if (sort === "requested-desc") return secondUnits - firstUnits;
    if (sort === "status-asc") return WAREHOUSE_STATUS_META[first.status].order - WAREHOUSE_STATUS_META[second.status].order;
    if (sort === "status-desc") return WAREHOUSE_STATUS_META[second.status].order - WAREHOUSE_STATUS_META[first.status].order;
    if (sort === "date-asc") return Date.parse(first.requestedAt) - Date.parse(second.requestedAt);
    return Date.parse(second.requestedAt) - Date.parse(first.requestedAt);
  }), [sort, transfers]);
  const pageCount = Math.max(1, Math.ceil(sortedTransfers.length / DOCUMENT_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = sortedTransfers.slice((safePage - 1) * DOCUMENT_PAGE_SIZE, safePage * DOCUMENT_PAGE_SIZE);

  function toggleSort(field: DocumentSortField) {
    setSort((current) => current === `${field}-asc` ? `${field}-desc` as DocumentSort : `${field}-asc` as DocumentSort);
    setPage(1);
  }

  if (!transfers.length) return <DashboardEmptyState title="No matching documents" description="Try another status, direction or search term." />;

  return <>
    <div className="hidden grid-cols-[minmax(260px,1.3fr)_150px_minmax(190px,.8fr)_230px_20px] items-center gap-4 border-b border-[#e4ddd7] bg-[#fcfaf8] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.09em] text-[#756960] lg:grid">
      <DocumentSortButton field="document" label="Document" sort={sort} onSort={toggleSort} /><DocumentSortButton field="requested" label="Requested" hint="variants / units" sort={sort} onSort={toggleSort} /><DocumentSortButton field="status" label="Status" sort={sort} onSort={toggleSort} /><DocumentSortButton field="date" label="Dates" sort={sort} onSort={toggleSort} /><span />
    </div>
    <div className="divide-y divide-[#e8e1db]">{visible.map((transfer) => {
    const meta = warehouseStatusMeta(transfer.status, transfer.direction);
    const needsReview = hasOpenDocumentIssue(transfer);
    const tone = needsReview ? "red" : meta.tone;
    const StatusIcon = needsReview ? AlertTriangle : transfer.direction === "to_brand" && ["pending", "submitted", "approved"].includes(transfer.status) ? RotateCcw : meta.icon;
    const statusLabel = needsReview ? "Needs review" : meta.shortLabel;
    const railClass = tone === "amber" ? "bg-amber-400" : tone === "emerald" ? "bg-emerald-500" : tone === "red" ? "bg-red-500" : tone === "blue" ? "bg-sky-500" : tone === "violet" ? "bg-violet-500" : "bg-stone-400";
    const statusClass = tone === "amber" ? "text-amber-800" : tone === "emerald" ? "text-emerald-800" : tone === "red" ? "text-red-700" : tone === "blue" ? "text-sky-800" : tone === "violet" ? "text-violet-800" : "text-stone-600";
    const requested = transfer.items.reduce((sum, item) => sum + item.requestedQty, 0);
    return <Link key={transfer.id} href={withBrand(`/brand-portal/warehouse/${transfer.id}`, brandParam)} aria-label={`Open ${documentNumber(transfer)}`} className="group relative grid gap-3 px-4 py-4 transition-colors hover:bg-[#fdfbf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 sm:px-5 lg:grid-cols-[minmax(260px,1.3fr)_150px_minmax(190px,.8fr)_230px_20px] lg:items-center lg:gap-4">
      <span aria-hidden="true" className={`absolute bottom-0 left-0 top-0 w-[3px] ${railClass}`} />
      <div className="flex min-w-0 items-center gap-3"><BrandMark brand={{ name: transfer.brandName, logoImage: transfer.brandLogoImage }} /><div className="min-w-0"><p className="truncate text-[12px] font-extrabold text-[#302924]">{documentNumber(transfer)}</p><p className="mt-1 truncate text-[10px] font-medium text-[#81746b]">{warehouseDocumentLabel(transfer.direction)}</p></div></div>
      <div><p className="text-[12px] font-extrabold tabular-nums text-[#302924]">{formatCount(transfer.items.length)} / {formatCount(requested)}</p><p className="mt-1 text-[9px] text-[#8d8076]">variants / units</p></div>
      <div className="flex flex-col items-start gap-0.5"><span className={`inline-flex items-center gap-1.5 text-[10.5px] font-extrabold ${statusClass}`}><StatusIcon aria-hidden="true" className="h-3.5 w-3.5" />{statusLabel}</span>{transfer.status === "received" && transfer.reconciliationStatus === "corrected" ? <span className="pl-5 text-[8.5px] font-bold tracking-[0.02em] text-[#7b6f66]">Corrected</span> : null}</div>
      <div><p className="text-[10.5px] font-semibold text-[#4f453e]"><span className="font-extrabold">Created</span> {formatDateTime(transfer.requestedAt)}</p><p className="mt-1 text-[9.5px] text-[#8d8076]">Updated {formatDateTime(transfer.updatedAt)}</p></div>
      <ChevronRight className="h-4 w-4 text-[#a2948a] transition-transform group-hover:translate-x-0.5 group-hover:text-[#C85956]" />
    </Link>;
  })}</div>
    <div className="border-t border-[#e8e1db] px-4 py-3 text-[9.5px] text-[#8d8076] sm:px-5">Showing {formatCount(visible.length)} of {formatCount(sortedTransfers.length)} matching documents</div>
    <Pager page={safePage} count={transfers.length} pageSize={DOCUMENT_PAGE_SIZE} onPage={setPage} />
  </>;
}

function buildReturnGroups(variants: WarehouseVariantRow[], query: string): ReturnProductGroup[] {
  const products = new Map<string, { productName: string; productImage: string | null; colors: Map<string, Array<{ variant: WarehouseVariantRow; size: string }>> }>();
  for (const variant of variants) {
    if (Math.max(0, variant.quantity - variant.pendingReturnQty) <= 0) continue;
    const color = variant.colorLabel || "Default";
    const product = products.get(variant.productId) ?? { productName: variant.productName, productImage: variant.productImage, colors: new Map() };
    const colorVariants = product.colors.get(color) ?? [];
    colorVariants.push({ variant, size: variant.sizeLabel || "One size" });
    product.colors.set(color, colorVariants);
    products.set(variant.productId, product);
  }
  return [...products.entries()]
    .map(([productId, product]) => ({ productId, productName: product.productName, productImage: product.productImage, colors: [...product.colors.entries()].map(([label, colorVariants]) => ({ label, variants: colorVariants })) }))
    .filter((product) => !query || `${product.productName} ${product.colors.flatMap((color) => color.variants.map(({ variant, size }) => `${color.label} ${size} ${variant.optionLabel} ${variant.sku}`)).join(" ")}`.toLocaleLowerCase().includes(query));
}

function groupVariantIds(product: ReturnProductGroup): string[] {
  return product.colors.flatMap((color) => color.variants.map(({ variant }) => variant.variantId));
}

function BulkSelectionCheckbox({ checked, indeterminate, label, onChange, className = "" }: { checked: boolean; indeterminate: boolean; label: string; onChange: (checked: boolean) => void; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (inputRef.current) inputRef.current.indeterminate = indeterminate; }, [indeterminate]);
  return <label title={label} className={`flex h-10 w-10 flex-none cursor-pointer items-center justify-center rounded-xl bg-white ring-1 ring-inset ring-[#e1d8d0] transition hover:bg-[#f7f2ed] ${className}`}><input ref={inputRef} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} className="h-4 w-4 accent-[#C85956]" /></label>;
}

export function ReturnRequestDrawer({ open, onClose, onSubmitted, variants, brandParam }: { open: boolean; onClose: () => void; onSubmitted: () => void; variants: WarehouseVariantRow[]; brandParam?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const returnOperationKey = useRef(crypto.randomUUID());
  const groups = useMemo(() => buildReturnGroups(variants, deferredQuery), [deferredQuery, variants]);
  const selectableVariantIds = useMemo(() => groups.flatMap(groupVariantIds), [groups]);
  const allResultsSelected = selectableVariantIds.length > 0 && selectableVariantIds.every((variantId) => selected.has(variantId));
  const someResultsSelected = selectableVariantIds.some((variantId) => selected.has(variantId));
  const safePage = Math.min(page, Math.max(1, Math.ceil(groups.length / RETURN_PRODUCT_PAGE_SIZE)));
  const visibleGroups = groups.slice((safePage - 1) * RETURN_PRODUCT_PAGE_SIZE, safePage * RETURN_PRODUCT_PAGE_SIZE);
  const availableByVariant = useMemo(() => new Map(variants.map((variant) => [variant.variantId, Math.max(0, variant.quantity - variant.pendingReturnQty)])), [variants]);
  const allSelectedQuantitiesValid = selected.size > 0 && [...selected].every((variantId) => {
    const quantity = quantities[variantId] ?? 0;
    const available = availableByVariant.get(variantId) ?? 0;
    return Number.isInteger(quantity) && quantity > 0 && quantity <= available;
  });
  const returnItems = useMemo(() => [...selected].map((variantId) => ({ variantId, requestedQty: quantities[variantId] ?? 0 })).filter((item) => item.requestedQty > 0), [quantities, selected]);
  const selectedUnits = returnItems.reduce((sum, item) => sum + item.requestedQty, 0);
  const confirmationGroups = useMemo(() => buildReturnGroups(variants, "").map((product) => ({
    ...product,
    colors: product.colors.map((color) => ({
      ...color,
      variants: color.variants.filter(({ variant }) => returnItems.some((item) => item.variantId === variant.variantId)),
    })).filter((color) => color.variants.length > 0),
  })).filter((product) => product.colors.length > 0), [returnItems, variants]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { setError(""); if (confirming) setConfirming(false); else onClose(); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, confirming, onClose, open]);

  function toggleVariant(id: string, checked: boolean) {
    setSelected((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  }

  function toggleVariants(variantIds: string[], checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const variantId of variantIds) if (checked) next.add(variantId); else next.delete(variantId);
      return next;
    });
  }

  function closeDrawer() {
    if (busy) return;
    setError("");
    setConfirming(false);
    onClose();
  }

  async function submitReturn() {
    if (!allSelectedQuantitiesValid) { setConfirming(false); return setError("Enter a valid quantity for every selected Variant."); }
    setBusy(true); setError("");
    try {
      const response = await fetch(withBrand("/api/brand-portal/warehouse/returns", brandParam), { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": returnOperationKey.current }, body: JSON.stringify({ items: returnItems, note: note.trim() || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "We couldn't submit this return request.");
      setSelected(new Set()); setQuantities({}); setNote(""); setQuery(""); setConfirming(false); returnOperationKey.current = crypto.randomUUID(); onSubmitted(); onClose(); router.refresh();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "We couldn't submit this return request."); }
    finally { setBusy(false); }
  }

  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby={confirming ? "return-confirmation-title" : "return-request-title"}>
    <button type="button" aria-label="Close return request" onClick={closeDrawer} className="absolute inset-0 bg-[#2b2521]/25 backdrop-blur-[2px]" />
    {confirming ? <aside className="absolute inset-y-0 right-0 z-20 flex h-full w-full max-w-md flex-col bg-[#fffdfb] shadow-[-20px_0_60px_rgba(61,43,31,.2)] lg:relative lg:right-auto">
      <header className="flex items-start gap-4 border-b border-[#ded5cd] px-5 py-5 sm:px-6"><span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Check className="h-[18px] w-[18px]" /></span><div className="min-w-0 flex-1"><h2 id="return-confirmation-title" className="text-[17px] font-extrabold tracking-[-0.025em] text-[#302924]">Confirm stock return</h2><p className="mt-1 text-[10.5px] leading-5 text-[#786b62]">Review every Variant and quantity before sending this request to Zakhnook.</p></div><button type="button" onClick={() => { setError(""); setConfirming(false); }} disabled={busy} aria-label="Back to return selection" className="flex h-9 w-9 items-center justify-center rounded-xl text-[#756960] transition hover:bg-[#f1ebe6] active:scale-[0.96] disabled:opacity-40"><X className="h-4 w-4" /></button></header>
      <div className="border-b border-[#e7dfd8] bg-[#f8f3ef] px-5 py-4 sm:px-6"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-white px-3 py-3"><p className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#91837a]">Variants</p><p className="mt-1 text-[18px] font-extrabold tabular-nums text-[#302924]">{returnItems.length}</p></div><div className="rounded-xl bg-white px-3 py-3"><p className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#91837a]">Total units</p><p className="mt-1 text-[18px] font-extrabold tabular-nums text-[#302924]">{selectedUnits}</p></div></div></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        {error ? <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-[10.5px] font-semibold text-red-800">{error}</p> : null}
        <div className="space-y-3">{confirmationGroups.map((product) => <section key={product.productId} className="overflow-hidden rounded-2xl border border-[#ebe3dc] bg-white"><div className="flex items-center gap-3 border-b border-[#eee7e1] px-3 py-3"><span className="relative h-12 w-10 flex-none overflow-hidden rounded-lg bg-[#f1eae4]">{product.productImage ? <Image src={product.productImage} alt={product.productName} fill sizes="40px" className="object-cover" /> : null}</span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-extrabold text-[#403730]">{product.productName}</span><span className="mt-0.5 block text-[8.5px] text-[#91837a]">{product.colors.reduce((sum, color) => sum + color.variants.length, 0)} selected Variants</span></span></div><div className="divide-y divide-[#f0eae5]">{product.colors.flatMap((color) => color.variants.map(({ variant, size }) => { const requestedQty = quantities[variant.variantId] ?? 0; return <div key={variant.variantId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3"><div className="min-w-0"><span className="flex items-center gap-2"><ColorSwatch swatchType={variant.swatchType} primaryColor={variant.primaryColor} secondaryColor={variant.secondaryColor} size={14} /><span className="truncate text-[10px] font-bold text-[#51473f]">{color.label} · {size}</span></span><code className="mt-1 block truncate pl-[22px] text-[8px] text-[#91837a]">{variant.sku}</code></div><span className="rounded-lg bg-[#f5eeea] px-2.5 py-1.5 text-[10px] font-extrabold tabular-nums text-[#9e4845]">{requestedQty} {requestedQty === 1 ? "unit" : "units"}</span></div>; }))}</div></section>)}</div>
        {note.trim() ? <div className="mt-4 rounded-xl bg-[#f7f2ed] px-4 py-3"><p className="text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#91837a]">Return note</p><p className="mt-1.5 text-[10px] leading-5 text-[#51473f]">{note.trim()}</p></div> : null}
      </div>
      <footer className="border-t border-[#ded5cd] bg-[#f3ede8] px-5 py-4 sm:px-6"><div className="mb-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[9.5px] leading-4 text-amber-900"><strong>Please confirm:</strong> submitting this request immediately removes these units from available stock and places them on Return hold at Zakhnook. They become Returned to brand only after dispatch and your delivery confirmation.</div><div className="flex items-center justify-between gap-3"><button type="button" onClick={() => { setError(""); setConfirming(false); }} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-[10.5px] font-bold text-[#675b52] transition hover:bg-white active:scale-[0.98] disabled:opacity-40"><ArrowLeft className="h-3.5 w-3.5" />Back to edit</button><button type="button" onClick={submitReturn} disabled={busy || !returnItems.length} className="inline-flex h-10 items-center justify-center rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white transition hover:bg-[#b84e4b] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">{busy ? <><Loader2 aria-hidden="true" className="mr-2 h-3.5 w-3.5 animate-spin" />Submitting…</> : "Confirm return"}</button></div></footer>
    </aside> : null}
    <aside className="relative flex h-full w-full max-w-2xl flex-col bg-[#f6f2ed] shadow-[-20px_0_60px_rgba(61,43,31,.16)]">
      <header className="flex items-start gap-4 border-b border-[#ded5cd] px-5 py-5 sm:px-6"><span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#eadfda] text-[#C85956]"><ArrowDownToLine className="h-[18px] w-[18px]" /></span><div className="min-w-0 flex-1"><h2 id="return-request-title" className="text-[17px] font-extrabold tracking-[-0.025em] text-[#302924]">Request stock return</h2><p className="mt-1 max-w-lg text-[10.5px] leading-5 text-[#786b62]">Choose sellable units held at Zakhnook. Submitting creates one return document for warehouse review.</p></div><button type="button" onClick={closeDrawer} disabled={busy} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-[#756960] transition hover:bg-[#e9e1da] active:scale-[0.96] disabled:opacity-40"><X className="h-4 w-4" /></button></header>
      <div className="flex items-center gap-2 border-b border-[#ded5cd] px-5 py-3 sm:px-6"><BulkSelectionCheckbox checked={allResultsSelected} indeterminate={someResultsSelected && !allResultsSelected} label={allResultsSelected ? "Clear all products in search results" : "Select all products in search results"} onChange={(checked) => toggleVariants(selectableVariantIds, checked)} className={!selectableVariantIds.length ? "pointer-events-none opacity-40" : ""} /><label className="relative min-w-0 flex-1"><span className="sr-only">Search return inventory</span><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9d9086]" /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} autoComplete="off" placeholder="Search product, color, size or SKU…" className="h-10 w-full rounded-xl bg-white pl-9 pr-3 text-[11px] text-[#403730] outline-none ring-1 ring-[#e6ddd6] transition focus-visible:ring-2 focus-visible:ring-[#C85956]/30" /></label></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        {error ? <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-[10.5px] font-semibold text-red-800">{error}</p> : null}
        {visibleGroups.length ? <div className="space-y-2">{visibleGroups.map((product) => { const productVariantIds = groupVariantIds(product); const productSelectedCount = productVariantIds.filter((variantId) => selected.has(variantId)).length; const productSelected = productSelectedCount === productVariantIds.length; return <div key={product.productId} className="flex items-start gap-3 rounded-2xl bg-white p-3"><BulkSelectionCheckbox checked={productSelected} indeterminate={productSelectedCount > 0 && !productSelected} label={productSelected ? `Clear ${product.productName}` : `Select all Variants for ${product.productName}`} onChange={(checked) => toggleVariants(productVariantIds, checked)} className="mt-2" /><details className="group min-w-0 flex-1" open={deferredQuery ? true : undefined}><summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25 [&::-webkit-details-marker]:hidden"><span className="relative h-14 w-12 flex-none overflow-hidden rounded-xl bg-[#f1eae4]">{product.productImage ? <Image src={product.productImage} alt={product.productName} fill sizes="48px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-[8px] font-bold uppercase tracking-[0.06em] text-[#a29489]">No image</span>}</span><span className="min-w-0 flex-1"><span className="block truncate text-[11.5px] font-extrabold text-[#403730]">{product.productName}</span><span className="mt-1 block text-[9px] font-medium text-[#91837a]">{productVariantIds.length} Variants · {product.colors.length} {product.colors.length === 1 ? "color" : "colors"}</span></span><ChevronDown className="h-3.5 w-3.5 text-[#9b8e84] transition-transform group-open:rotate-180" /></summary><div className="mt-3 border-t border-[#eee7e1] px-1 pt-3">{product.colors.map((color) => <section key={color.label} className="mb-3 last:mb-0"><p className="mb-1.5 px-1 text-[9px] font-bold text-[#756960]">{color.label}</p><div className="space-y-1">{color.variants.map(({ variant, size }) => { const checked = selected.has(variant.variantId); const max = Math.max(0, variant.quantity - variant.pendingReturnQty); return <label key={variant.variantId} className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition ${checked ? "bg-[#f7ebe8]" : "bg-[#faf7f4] hover:bg-[#f4efea]"}`}><input type="checkbox" checked={checked} onChange={(event) => toggleVariant(variant.variantId, event.target.checked)} className="h-4 w-4 accent-[#C85956]" /><span className="min-w-0"><span className="flex items-center gap-2" title={variant.colorLabel ?? color.label}><ColorSwatch swatchType={variant.swatchType} primaryColor={variant.primaryColor} secondaryColor={variant.secondaryColor} size={14} /><span className="truncate text-[10.5px] font-bold text-[#51473f]">{size}</span></span><code className="mt-1 block truncate text-[8.5px] text-[#91837a]">{variant.sku}</code></span><span className="text-right"><span className="block text-[12px] font-extrabold tabular-nums text-[#403730]">{max}</span><span className="block text-[8px] text-[#9a8d83]">available</span></span><input aria-label={`Return quantity for ${variant.sku}`} type="number" inputMode="numeric" min={1} max={max} step={1} disabled={!checked} value={quantities[variant.variantId] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [variant.variantId]: Math.max(0, Math.min(max, Math.trunc(Number(event.target.value) || 0))) }))} className="h-9 w-20 rounded-lg bg-white px-2 text-center text-[10.5px] font-bold tabular-nums outline-none ring-1 ring-[#e1d8d0] focus-visible:ring-2 focus-visible:ring-[#C85956]/30 disabled:bg-[#eee9e4]" placeholder="Qty" /></label>; })}</div></section>)}</div></details></div>; })}</div> : <DashboardEmptyState title="No returnable stock found" description={deferredQuery ? "Try another product, color, size or SKU." : "Only sellable units currently held at Zakhnook can be returned."} />}
        <Pager page={safePage} count={groups.length} pageSize={RETURN_PRODUCT_PAGE_SIZE} onPage={setPage} />
      </div>
      <footer className="border-t border-[#ded5cd] bg-[#eee7e0] px-5 py-4 sm:px-6"><label className="block"><span className="text-[9px] font-bold text-[#756960]">Return note <span className="font-normal text-[#9a8d83]">(optional)</span></span><input value={note} onChange={(event) => setNote(event.target.value)} autoComplete="off" placeholder="Reason or pickup preference…" className="mt-1.5 h-10 w-full rounded-xl bg-white px-3 text-[10.5px] outline-none ring-1 ring-[#e1d8d0] focus-visible:ring-2 focus-visible:ring-[#C85956]/30" /></label><div className="mt-3 flex items-center justify-between gap-3"><div><p className="text-[9.5px] text-[#756960]"><strong className="tabular-nums text-[#403730]">{returnItems.length}</strong> Variants · <strong className="tabular-nums text-[#403730]">{selectedUnits}</strong> units</p>{selected.size > 0 && !allSelectedQuantitiesValid ? <p className="mt-1 text-[8.5px] font-semibold text-amber-800">Add a quantity for every selected Variant.</p> : null}</div><button type="button" onClick={() => { setError(""); setConfirming(true); }} disabled={busy || !allSelectedQuantitiesValid} className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-[10.5px] font-bold transition active:scale-[0.98] disabled:cursor-not-allowed ${allSelectedQuantitiesValid ? "bg-[#C85956] text-white hover:bg-[#b84e4b]" : "bg-[#d9d1ca] text-[#8b7e75]"}`}>Review return</button></div></footer>
    </aside>
  </div>;
}

export default function WarehouseExperience({ transfers, brandParam, readOnly = false }: { transfers: WarehouseTransferRow[]; brandParam?: string; readOnly?: boolean }) {
  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [documentQuery, setDocumentQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const deferredDocumentQuery = useDeferredValue(documentQuery.trim().toLocaleLowerCase());
  const issueCount = transfers.filter(hasOpenDocumentIssue).length;
  const filteredTransfers = useMemo(() => transfers
    .filter((transfer) => documentFilter === "all" || (documentFilter === "requested" && ["pending", "submitted"].includes(transfer.status)) || (documentFilter === "preparing" && transfer.status === "approved") || (documentFilter === "in_transit" && transfer.status === "in_transit") || (documentFilter === "received" && transfer.status === "received") || (documentFilter === "action_required" && hasOpenDocumentIssue(transfer)))
    .filter((transfer) => directionFilter === "all" || transfer.direction === directionFilter)
    .filter((transfer) => {
      const requestedAt = new Date(transfer.requestedAt).getTime();
      if (fromDate && requestedAt < new Date(`${fromDate}T00:00:00`).getTime()) return false;
      if (toDate && requestedAt > new Date(`${toDate}T23:59:59.999`).getTime()) return false;
      return true;
    })
    .filter((transfer) => !deferredDocumentQuery || `${documentNumber(transfer)} ${transfer.items.map((item) => `${item.productName} ${item.optionLabel} ${item.sku}`).join(" ")}`.toLocaleLowerCase().includes(deferredDocumentQuery))
    .sort((first, second) => Number(hasOpenDocumentIssue(second)) - Number(hasOpenDocumentIssue(first)) || Date.parse(second.requestedAt) - Date.parse(first.requestedAt)), [deferredDocumentQuery, directionFilter, documentFilter, fromDate, toDate, transfers]);
  const filtersActive = Boolean(documentQuery || directionFilter !== "all" || documentFilter !== "all" || fromDate || toDate);
  const statusCounts: Record<DocumentFilter, number> = {
    all: transfers.length,
    requested: transfers.filter((transfer) => ["pending", "submitted"].includes(transfer.status)).length,
    preparing: transfers.filter((transfer) => transfer.status === "approved").length,
    in_transit: transfers.filter((transfer) => transfer.status === "in_transit").length,
    action_required: issueCount,
    received: transfers.filter((transfer) => transfer.status === "received").length,
  };
  const statusFilters: Array<{ value: DocumentFilter; label: string; tone: string }> = [
    { value: "all", label: "All", tone: "bg-[#C85956]" },
    { value: "requested", label: "Requested", tone: "bg-amber-400" },
    { value: "preparing", label: "Preparing / awaiting", tone: "bg-[#a9bbc5]" },
    { value: "in_transit", label: "In transit", tone: "bg-sky-500" },
    { value: "action_required", label: "Needs review", tone: "bg-red-500" },
    { value: "received", label: "Received", tone: "bg-emerald-500" },
  ];

  return <div>
    <header>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2"><h1 className="text-[25px] font-extrabold tracking-[-0.035em] text-[#242424]">Stock Transfers</h1><span className="text-[11px] font-semibold text-[#81746b]">{formatCount(transfers.length)} documents</span></div>
          <p className="mt-2 max-w-2xl text-[11.5px] leading-5 text-[#756960]">Track stock transfers, returns and recorded warehouse corrections for your brand.</p>
        </div>
        {readOnly ? <span className="inline-flex h-9 items-center rounded-xl bg-[#f2ede8] px-3 text-[9.5px] font-semibold text-[#81746b]">Admin view · read only</span> : null}
      </div>
    </header>

    <div className="mt-5" data-dashboard-filters="true">
      <div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="relative order-[1] min-w-0 flex-1 sm:w-[330px] sm:flex-none"><span className="sr-only">Search documents</span><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9d8f84]" /><input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} autoComplete="off" placeholder="Search document, product or SKU" className="h-10 w-full rounded-xl border border-[#e7ddd5] bg-[#fcfaf8] pl-9 pr-3 text-[11px] text-[#403730] outline-none transition placeholder:text-[#9b8d82] focus:bg-white" /></label>
          <div aria-label="Document status" className="order-[2] flex h-10 min-w-0 flex-none items-center overflow-x-auto rounded-xl border border-[#e7ddd5] bg-white">{statusFilters.map((filter) => { const active = documentFilter === filter.value; return <button key={filter.value} type="button" aria-pressed={active} onClick={() => setDocumentFilter(filter.value)} className={`h-full whitespace-nowrap border-r border-[#eee7e1] px-3 text-[10px] font-bold transition last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/30 ${active ? "bg-[#f7e8e6] text-[#C85956]" : "text-[#6f6259] hover:bg-[#fcfaf8] hover:text-[#302924]"}`}><span aria-hidden="true" className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${filter.tone}`} /><span>{filter.label}</span><span className="ml-1.5 tabular-nums text-[9px] opacity-65">{statusCounts[filter.value]}</span></button>; })}</div>
          <DateRangePicker key={`${fromDate}-${toDate}`} defaultFrom={fromDate} defaultTo={toDate} fromName={null} toName={null} label="Requested date range" compact onRangeChange={({ from, to }) => { setFromDate(from); setToDate(to); }} />
          {filtersActive ? <button type="button" aria-label="Clear warehouse filters" onClick={() => { setDocumentQuery(""); setDirectionFilter("all"); setDocumentFilter("all"); setFromDate(""); setToDate(""); }} className="order-[5] inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#8d8076] transition-colors hover:bg-[#f7f1ec] hover:text-[#C85956]"><X className="h-3.5 w-3.5" aria-hidden="true" /></button> : null}
          <DashboardMoreFilters label="More warehouse filters" active={directionFilter !== "all"}>
            <DashboardFilterField label="Document direction"><select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as DirectionFilter)} className={`${dashboardFilterControl} w-full`}><option value="all">All directions</option><option value="to_local">Sent to Zakhnook</option><option value="to_brand">Returns to brand</option></select></DashboardFilterField>
          </DashboardMoreFilters>
        </div>
      </div>
    </div>
    <section className="mt-4 overflow-hidden rounded-[20px] border border-[#e6ded7] bg-white shadow-[0_10px_32px_rgba(72,50,36,.045)]">
      <DocumentList transfers={filteredTransfers} brandParam={brandParam} />
    </section>
  </div>;
}
