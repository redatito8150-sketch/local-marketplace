"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDownToLine, CheckCircle2, ChevronDown, Clock3, ExternalLink, Loader2, PackageCheck, RotateCcw, Search, Truck, X, XCircle } from "lucide-react";
import { DashboardEmptyState } from "@/components/dashboard/DashboardUI";
import type { WarehouseTransferRow, WarehouseVariantRow } from "@/lib/data/warehouse";
import { formatDateTime } from "@/lib/format";

type DocumentFilter = "all" | "active" | "completed" | "issues";
type DirectionFilter = "all" | WarehouseTransferRow["direction"];
type StatusMeta = { label: string; className: string; icon: React.ElementType };
type ReturnColorGroup = { label: string; variants: Array<{ variant: WarehouseVariantRow; size: string }> };
type ReturnProductGroup = { productId: string; productName: string; colors: ReturnColorGroup[] };

const OPEN_STATUSES = new Set<WarehouseTransferRow["status"]>(["draft", "pending", "submitted", "approved", "in_transit", "receiving", "partially_received"]);
const TERMINAL_STATUSES = new Set<WarehouseTransferRow["status"]>(["received", "rejected", "cancelled"]);
const DOCUMENT_PAGE_SIZE = 12;
const RETURN_PRODUCT_PAGE_SIZE = 8;

function withBrand(path: string, brandParam?: string): string {
  return brandParam ? `${path}?brand=${encodeURIComponent(brandParam)}` : path;
}

function hasDocumentIssue(transfer: WarehouseTransferRow): boolean {
  return transfer.hasDiscrepancy
    || ["open_discrepancy", "partially_settled"].includes(transfer.reconciliationStatus)
    || transfer.items.some((item) => (item.damagedQty ?? 0) > 0 || (item.missingQty ?? 0) > 0);
}

function statusMeta(transfer: WarehouseTransferRow): StatusMeta {
  if (transfer.status === "rejected") return { label: "Rejected", className: "bg-red-50 text-red-700", icon: XCircle };
  if (transfer.status === "cancelled") return { label: "Cancelled", className: "bg-stone-100 text-stone-600", icon: XCircle };
  if (transfer.status === "received") {
    if (hasDocumentIssue(transfer)) return { label: "Received with differences", className: "bg-amber-50 text-amber-900", icon: AlertTriangle };
    return { label: transfer.direction === "to_brand" ? "Returned" : "Received", className: "bg-emerald-50 text-emerald-800", icon: CheckCircle2 };
  }
  if (transfer.status === "partially_received") return { label: "Received with differences", className: "bg-amber-50 text-amber-900", icon: AlertTriangle };
  if (transfer.direction === "to_brand") return { label: "Return requested", className: "bg-sky-50 text-sky-800", icon: RotateCcw };
  if (["in_transit", "receiving"].includes(transfer.status)) return { label: "Awaiting receipt", className: "bg-sky-50 text-sky-800", icon: Truck };
  return { label: "Requested", className: "bg-amber-50 text-amber-800", icon: Clock3 };
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
  const pageCount = Math.max(1, Math.ceil(transfers.length / DOCUMENT_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = transfers.slice((safePage - 1) * DOCUMENT_PAGE_SIZE, safePage * DOCUMENT_PAGE_SIZE);

  if (!transfers.length) return <DashboardEmptyState title="No matching documents" description="Try another status, direction or search term." />;

  return <><div className="divide-y divide-[#e3dbd4]">{visible.map((transfer) => {
    const meta = statusMeta(transfer);
    const Icon = meta.icon;
    const requested = transfer.items.reduce((sum, item) => sum + item.requestedQty, 0);
    const processed = transfer.items.reduce((sum, item) => sum + (item.receivedOkQty ?? item.returnedQty ?? 0), 0);
    return <article key={transfer.id} className="group px-4 py-4 transition-colors hover:bg-white/45 sm:px-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-[12px] font-extrabold tracking-[-0.01em] text-[#302924]">{documentNumber(transfer)}</h3><span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] font-bold ${meta.className}`}><Icon aria-hidden="true" className="h-3 w-3" />{meta.label}</span>{hasDocumentIssue(transfer) ? <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800"><AlertTriangle aria-hidden="true" className="h-3 w-3" />Issue recorded</span> : null}</div><p className="mt-1.5 text-[10px] text-[#81746b]">{transfer.direction === "to_local" ? "Stock sent to Zakhnook" : "Stock returned to your brand"} · {formatDateTime(transfer.requestedAt)}</p></div>
        <dl className="grid grid-cols-3 gap-5 text-right sm:min-w-[280px]"><div><dt className="text-[8px] font-bold uppercase tracking-[0.06em] text-[#9a8d83]">Variants</dt><dd className="mt-0.5 text-[13px] font-extrabold tabular-nums text-[#403730]">{transfer.items.length}</dd></div><div><dt className="text-[8px] font-bold uppercase tracking-[0.06em] text-[#9a8d83]">Requested</dt><dd className="mt-0.5 text-[13px] font-extrabold tabular-nums text-[#403730]">{requested}</dd></div><div><dt className="text-[8px] font-bold uppercase tracking-[0.06em] text-[#9a8d83]">Processed</dt><dd className="mt-0.5 text-[13px] font-extrabold tabular-nums text-[#403730]">{processed}</dd></div></dl>
        <Link href={withBrand(`/brand-portal/warehouse/${transfer.id}`, brandParam)} aria-label={`Open ${documentNumber(transfer)}`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#242424] px-3 text-[9.5px] font-bold text-white transition hover:bg-[#3a332e] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/15">Open<ExternalLink className="h-3 w-3" /></Link>
      </div>
    </article>;
  })}</div><Pager page={safePage} count={transfers.length} pageSize={DOCUMENT_PAGE_SIZE} onPage={setPage} /></>;
}

function buildReturnGroups(variants: WarehouseVariantRow[], query: string): ReturnProductGroup[] {
  const products = new Map<string, { productName: string; colors: Map<string, Array<{ variant: WarehouseVariantRow; size: string }>> }>();
  for (const variant of variants) {
    if (Math.max(0, variant.quantity - variant.pendingReturnQty) <= 0) continue;
    if (query && !`${variant.productName} ${variant.optionLabel} ${variant.sku}`.toLocaleLowerCase().includes(query)) continue;
    const [color = "Default", ...sizeParts] = variant.optionLabel.split(" / ");
    const product = products.get(variant.productId) ?? { productName: variant.productName, colors: new Map() };
    const colorVariants = product.colors.get(color || "Default") ?? [];
    colorVariants.push({ variant, size: sizeParts.join(" / ") || "One size" });
    product.colors.set(color || "Default", colorVariants);
    products.set(variant.productId, product);
  }
  return [...products.entries()].map(([productId, product]) => ({ productId, productName: product.productName, colors: [...product.colors.entries()].map(([label, colorVariants]) => ({ label, variants: colorVariants })) }));
}

function ReturnRequestDrawer({ open, onClose, onSubmitted, variants, brandParam }: { open: boolean; onClose: () => void; onSubmitted: () => void; variants: WarehouseVariantRow[]; brandParam?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const returnOperationKey = useRef(crypto.randomUUID());
  const groups = useMemo(() => buildReturnGroups(variants, deferredQuery), [deferredQuery, variants]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(groups.length / RETURN_PRODUCT_PAGE_SIZE)));
  const visibleGroups = groups.slice((safePage - 1) * RETURN_PRODUCT_PAGE_SIZE, safePage * RETURN_PRODUCT_PAGE_SIZE);
  const selectedUnits = [...selected].reduce((sum, id) => sum + (quantities[id] ?? 0), 0);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { setError(""); onClose(); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [busy, onClose, open]);

  function toggleVariant(id: string, checked: boolean) {
    setSelected((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  }

  function closeDrawer() {
    if (busy) return;
    setError("");
    onClose();
  }

  async function submitReturn() {
    const items = [...selected].map((variantId) => ({ variantId, requestedQty: quantities[variantId] ?? 0 })).filter((item) => item.requestedQty > 0);
    if (!items.length) return setError("Enter a positive quantity for at least one selected Variant.");
    setBusy(true); setError("");
    try {
      const response = await fetch(withBrand("/api/brand-portal/warehouse/returns", brandParam), { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": returnOperationKey.current }, body: JSON.stringify({ items, note: note.trim() || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "We couldn't submit this return request.");
      setSelected(new Set()); setQuantities({}); setNote(""); setQuery(""); returnOperationKey.current = crypto.randomUUID(); onSubmitted(); onClose(); router.refresh();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "We couldn't submit this return request."); }
    finally { setBusy(false); }
  }

  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="return-request-title">
    <button type="button" aria-label="Close return request" onClick={closeDrawer} className="absolute inset-0 bg-[#2b2521]/25 backdrop-blur-[2px]" />
    <aside className="relative flex h-full w-full max-w-2xl flex-col bg-[#f6f2ed] shadow-[-20px_0_60px_rgba(61,43,31,.16)]">
      <header className="flex items-start gap-4 border-b border-[#ded5cd] px-5 py-5 sm:px-6"><span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#eadfda] text-[#C85956]"><ArrowDownToLine className="h-[18px] w-[18px]" /></span><div className="min-w-0 flex-1"><h2 id="return-request-title" className="text-[17px] font-extrabold tracking-[-0.025em] text-[#302924]">Request stock return</h2><p className="mt-1 max-w-lg text-[10.5px] leading-5 text-[#786b62]">Choose sellable units held at Zakhnook. Submitting creates one return document for warehouse review.</p></div><button type="button" onClick={closeDrawer} disabled={busy} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-xl text-[#756960] transition hover:bg-[#e9e1da] active:scale-[0.96] disabled:opacity-40"><X className="h-4 w-4" /></button></header>
      <div className="border-b border-[#ded5cd] px-5 py-3 sm:px-6"><label className="relative block"><span className="sr-only">Search return inventory</span><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9d9086]" /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} autoComplete="off" placeholder="Search product, color, size or SKU…" className="h-10 w-full rounded-xl bg-white pl-9 pr-3 text-[11px] text-[#403730] outline-none ring-1 ring-[#e6ddd6] transition focus-visible:ring-2 focus-visible:ring-[#C85956]/30" /></label></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        {error ? <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-[10.5px] font-semibold text-red-800">{error}</p> : null}
        {visibleGroups.length ? <div className="space-y-2">{visibleGroups.map((product) => <details key={product.productId} className="group overflow-hidden rounded-2xl bg-white" open={deferredQuery ? true : undefined}><summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/25 [&::-webkit-details-marker]:hidden"><span className="min-w-0 flex-1"><span className="block truncate text-[11.5px] font-extrabold text-[#403730]">{product.productName}</span><span className="mt-0.5 block text-[9px] text-[#91837a]">{product.colors.reduce((sum, color) => sum + color.variants.length, 0)} Variants · {product.colors.length} colors</span></span><ChevronDown className="h-3.5 w-3.5 text-[#9b8e84] transition-transform group-open:rotate-180" /></summary><div className="border-t border-[#eee7e1] px-3 py-3">{product.colors.map((color) => <section key={color.label} className="mb-3 last:mb-0"><p className="mb-1.5 px-1 text-[9px] font-bold text-[#756960]">{color.label}</p><div className="space-y-1">{color.variants.map(({ variant, size }) => { const checked = selected.has(variant.variantId); const max = Math.max(0, variant.quantity - variant.pendingReturnQty); return <label key={variant.variantId} className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition ${checked ? "bg-[#f7ebe8]" : "bg-[#faf7f4] hover:bg-[#f4efea]"}`}><input type="checkbox" checked={checked} onChange={(event) => toggleVariant(variant.variantId, event.target.checked)} className="h-4 w-4 accent-[#C85956]" /><span className="min-w-0"><span className="block truncate text-[10.5px] font-bold text-[#51473f]">{size}</span><code className="mt-0.5 block truncate text-[8.5px] text-[#91837a]">{variant.sku}</code></span><span className="text-right"><span className="block text-[12px] font-extrabold tabular-nums text-[#403730]">{max}</span><span className="block text-[8px] text-[#9a8d83]">available</span></span><input aria-label={`Return quantity for ${variant.sku}`} type="number" inputMode="numeric" min={1} max={max} step={1} disabled={!checked} value={quantities[variant.variantId] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [variant.variantId]: Math.max(0, Math.min(max, Math.trunc(Number(event.target.value) || 0))) }))} className="h-9 w-20 rounded-lg bg-white px-2 text-center text-[10.5px] font-bold tabular-nums outline-none ring-1 ring-[#e1d8d0] focus-visible:ring-2 focus-visible:ring-[#C85956]/30 disabled:bg-[#eee9e4]" placeholder="Qty" /></label>; })}</div></section>)}</div></details>)}</div> : <DashboardEmptyState title="No returnable stock found" description={deferredQuery ? "Try another product, color, size or SKU." : "Only sellable units currently held at Zakhnook can be returned."} />}
        <Pager page={safePage} count={groups.length} pageSize={RETURN_PRODUCT_PAGE_SIZE} onPage={setPage} />
      </div>
      <footer className="border-t border-[#ded5cd] bg-[#eee7e0] px-5 py-4 sm:px-6"><label className="block"><span className="text-[9px] font-bold text-[#756960]">Return note <span className="font-normal text-[#9a8d83]">(optional)</span></span><input value={note} onChange={(event) => setNote(event.target.value)} autoComplete="off" placeholder="Reason or pickup preference…" className="mt-1.5 h-10 w-full rounded-xl bg-white px-3 text-[10.5px] outline-none ring-1 ring-[#e1d8d0] focus-visible:ring-2 focus-visible:ring-[#C85956]/30" /></label><div className="mt-3 flex items-center justify-between gap-3"><p className="text-[9.5px] text-[#756960]"><strong className="tabular-nums text-[#403730]">{selected.size}</strong> Variants · <strong className="tabular-nums text-[#403730]">{selectedUnits}</strong> units</p><button type="button" onClick={submitReturn} disabled={busy || selectedUnits <= 0} className="inline-flex h-10 items-center justify-center rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white transition hover:bg-[#b84e4b] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">{busy ? <><Loader2 aria-hidden="true" className="mr-2 h-3.5 w-3.5 animate-spin" />Submitting…</> : "Submit return request"}</button></div></footer>
    </aside>
  </div>;
}

export default function WarehouseExperience({ variants, transfers, brandParam, readOnly = false }: { variants: WarehouseVariantRow[]; transfers: WarehouseTransferRow[]; brandParam?: string; readOnly?: boolean }) {
  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [documentQuery, setDocumentQuery] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [message, setMessage] = useState("");
  const closeReturn = useCallback(() => setReturnOpen(false), []);
  const deferredDocumentQuery = useDeferredValue(documentQuery.trim().toLocaleLowerCase());
  const activeCount = transfers.filter((transfer) => OPEN_STATUSES.has(transfer.status)).length;
  const awaitingReceiptCount = transfers.filter((transfer) => transfer.direction === "to_local" && OPEN_STATUSES.has(transfer.status)).length;
  const issueCount = transfers.filter(hasDocumentIssue).length;
  const completedCount = transfers.filter((transfer) => TERMINAL_STATUSES.has(transfer.status)).length;
  const filteredTransfers = useMemo(() => transfers
    .filter((transfer) => documentFilter === "all" || (documentFilter === "active" && OPEN_STATUSES.has(transfer.status)) || (documentFilter === "completed" && TERMINAL_STATUSES.has(transfer.status)) || (documentFilter === "issues" && hasDocumentIssue(transfer)))
    .filter((transfer) => directionFilter === "all" || transfer.direction === directionFilter)
    .filter((transfer) => !deferredDocumentQuery || `${documentNumber(transfer)} ${transfer.items.map((item) => `${item.productName} ${item.optionLabel} ${item.sku}`).join(" ")}`.toLocaleLowerCase().includes(deferredDocumentQuery))
    .sort((first, second) => Number(OPEN_STATUSES.has(second.status)) - Number(OPEN_STATUSES.has(first.status)) || Date.parse(second.requestedAt) - Date.parse(first.requestedAt)), [deferredDocumentQuery, directionFilter, documentFilter, transfers]);
  const summary = [
    { label: "Active", value: activeCount, note: "Needs tracking", tone: "bg-[#C85956]" },
    { label: "Awaiting receipt", value: awaitingReceiptCount, note: "Stock coming in", tone: "bg-sky-500" },
    { label: "Issues", value: issueCount, note: "Differences recorded", tone: "bg-amber-500" },
    { label: "Completed", value: completedCount, note: "Closed documents", tone: "bg-emerald-500" },
  ];

  return <div className="space-y-4">
    <section aria-label="Warehouse summary" className="overflow-hidden rounded-[18px] bg-[#ece7e0] shadow-[0_10px_28px_rgba(72,50,36,.06)]"><div className="grid grid-cols-2 lg:grid-cols-4">{summary.map((item, index) => <div key={item.label} className={`flex min-h-[72px] items-center gap-3 px-4 py-3 ${index % 2 === 0 ? "border-r" : ""} ${index < 2 ? "border-b lg:border-b-0" : ""} ${index < 3 ? "lg:border-r" : ""} border-[#ddd4cc]`}><span className={`h-8 w-1 rounded-full ${item.tone}`} /><div className="min-w-0"><p className="text-[9px] font-bold text-[#81746b]">{item.label}</p><div className="mt-0.5 flex items-baseline gap-2"><p className="text-[18px] font-extrabold tabular-nums tracking-[-0.04em] text-[#302924]">{item.value}</p><p className="truncate text-[8.5px] text-[#9a8d83]">{item.note}</p></div></div></div>)}</div></section>
    <section className="overflow-hidden rounded-[20px] bg-[#ece7e0] shadow-[0_12px_32px_rgba(72,50,36,.07)]">
      <header className="border-b border-[#ddd4cc] px-4 py-4 sm:px-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-[#C85956]" /><h2 className="text-[13px] font-extrabold tracking-[-0.015em] text-[#302924]">Documents</h2></div><p className="mt-1 text-[9.5px] text-[#81746b]">Restock shipments and stock returns in one record.</p></div>{!readOnly ? <button type="button" onClick={() => setReturnOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white transition hover:bg-[#b84e4b] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C85956]/20"><ArrowDownToLine className="h-3.5 w-3.5" />Request stock return</button> : <span className="text-[9.5px] font-semibold text-[#81746b]">Admin view · read only</span>}</div>
        <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(240px,1fr)_auto_180px] lg:items-center"><label className="relative block"><span className="sr-only">Search documents</span><Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9d9086]" /><input value={documentQuery} onChange={(event) => setDocumentQuery(event.target.value)} autoComplete="off" placeholder="Document, product or SKU…" className="h-10 w-full rounded-xl bg-white pl-9 pr-3 text-[10.5px] text-[#403730] outline-none ring-1 ring-[#e4dbd4] transition focus-visible:ring-2 focus-visible:ring-[#C85956]/30" /></label><div aria-label="Document status" className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-[#e2dcd5] p-1">{(["all", "active", "completed", "issues"] as DocumentFilter[]).map((filter) => <button key={filter} type="button" aria-pressed={documentFilter === filter} onClick={() => setDocumentFilter(filter)} className={`h-8 whitespace-nowrap rounded-lg px-3 text-[9.5px] font-bold capitalize transition active:scale-[0.98] ${documentFilter === filter ? "bg-white text-[#302924] shadow-[0_1px_4px_rgba(72,50,36,.09)]" : "text-[#81746b] hover:text-[#302924]"}`}>{filter}</button>)}</div><select aria-label="Document direction" value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as DirectionFilter)} className="h-10 rounded-xl bg-white px-3 text-[10px] font-semibold text-[#51473f] outline-none ring-1 ring-[#e4dbd4] focus-visible:ring-2 focus-visible:ring-[#C85956]/30"><option value="all">All directions</option><option value="to_local">Sent to Zakhnook</option><option value="to_brand">Returned to brand</option></select></div>
      </header>
      {message ? <div role="status" className="border-b border-emerald-200 bg-emerald-50 px-4 py-3 text-[10px] font-semibold text-emerald-800 sm:px-5">{message}</div> : null}
      <div className="flex items-center justify-between border-b border-[#ddd4cc] bg-[#f2ede8] px-4 py-2.5 sm:px-5"><p className="text-[9.5px] text-[#81746b]"><strong className="tabular-nums text-[#403730]">{filteredTransfers.length}</strong> matching documents</p>{(documentQuery || directionFilter !== "all" || documentFilter !== "all") ? <button type="button" onClick={() => { setDocumentQuery(""); setDirectionFilter("all"); setDocumentFilter("all"); }} className="text-[9px] font-bold text-[#C85956] hover:underline">Reset filters</button> : null}</div>
      <DocumentList transfers={filteredTransfers} brandParam={brandParam} />
    </section>
    <ReturnRequestDrawer open={returnOpen} onClose={closeReturn} onSubmitted={() => setMessage("Return request submitted for warehouse review.")} variants={variants} brandParam={brandParam} />
  </div>;
}
