"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, PackageCheck, Search, Truck, XCircle } from "lucide-react";
import { DashboardEmptyState } from "@/components/dashboard/DashboardUI";
import type { WarehouseTransferRow, WarehouseVariantRow } from "@/lib/data/warehouse";
import { formatDateTime } from "@/lib/format";

type WorkspaceView = "requests" | "returns" | "history";
type StatusMeta = { label: string; className: string; icon: React.ElementType };

const OPEN_STATUSES = new Set<WarehouseTransferRow["status"]>(["draft", "pending", "submitted", "approved", "in_transit", "receiving", "partially_received"]);
const PAGE_SIZE = 12;
const STATUS_BADGE: Record<WarehouseTransferRow["status"], StatusMeta> = {
  draft: { label: "Draft", className: "bg-stone-100 text-stone-700", icon: Clock3 },
  pending: { label: "Pending review", className: "bg-amber-50 text-amber-800", icon: Clock3 },
  submitted: { label: "Submitted", className: "bg-amber-50 text-amber-800", icon: Clock3 },
  approved: { label: "Approved", className: "bg-sky-50 text-sky-800", icon: CheckCircle2 },
  in_transit: { label: "In transit", className: "bg-sky-50 text-sky-800", icon: Truck },
  receiving: { label: "Receiving", className: "bg-violet-50 text-violet-800", icon: PackageCheck },
  partially_received: { label: "Partially received", className: "bg-violet-50 text-violet-800", icon: PackageCheck },
  received: { label: "Received", className: "bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-red-50 text-red-700", icon: XCircle },
  cancelled: { label: "Cancelled", className: "bg-stone-100 text-stone-600", icon: XCircle },
};

function withBrand(path: string, brandParam?: string): string {
  return brandParam ? `${path}?brand=${encodeURIComponent(brandParam)}` : path;
}

function Pager({ page, count, onPage }: { page: number; count: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  if (pages <= 1) return null;
  return <nav aria-label="List pages" className="flex items-center justify-between border-t border-[#eee7e1] px-4 py-3 sm:px-5">
    <p className="text-[10px] text-[#91837a]">Page <strong className="tabular-nums text-[#51473f]">{page}</strong> of {pages}</p>
    <div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-8 rounded-lg border border-[#e4d9d1] px-3 text-[10px] font-bold text-[#5d5148] hover:border-[#C85956]/30 disabled:cursor-not-allowed disabled:opacity-35">Previous</button><button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-8 rounded-lg bg-[#242424] px-3 text-[10px] font-bold text-white hover:bg-[#3a332e] disabled:cursor-not-allowed disabled:opacity-35">Next</button></div>
  </nav>;
}

function TransferList({ transfers, emptyTitle, emptyDescription }: { transfers: WarehouseTransferRow[]; emptyTitle: string; emptyDescription: string }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(transfers.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = transfers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  if (!transfers.length) return <DashboardEmptyState title={emptyTitle} description={emptyDescription} />;

  return <><div className="divide-y divide-[#eee7e1]">{visible.map((transfer) => {
    const meta = STATUS_BADGE[transfer.status];
    const Icon = meta.icon;
    const requested = transfer.items.reduce((sum, item) => sum + item.requestedQty, 0);
    const received = transfer.items.reduce((sum, item) => sum + (item.receivedOkQty ?? 0), 0);
    const discrepancy = transfer.items.reduce((sum, item) => sum + (item.damagedQty ?? 0) + (item.missingQty ?? 0), 0);
    return <article key={transfer.id} className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[11.5px] font-extrabold text-[#302924]">#{transfer.id.slice(0, 8).toUpperCase()}</span><span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[9.5px] font-bold ${meta.className}`}><Icon aria-hidden="true" className="h-3 w-3" />{meta.label}</span>{discrepancy > 0 && <span className="inline-flex items-center gap-1 text-[9.5px] font-bold text-amber-800"><AlertTriangle aria-hidden="true" className="h-3 w-3" />{discrepancy} need review</span>}</div><p className="mt-1.5 text-[10px] text-[#91837a]">{transfer.direction === "to_local" ? "Restock to Zakhnook" : "Return to your brand"} · {formatDateTime(transfer.requestedAt)}</p></div>
        <div className="grid grid-cols-3 divide-x divide-[#eee7e1] rounded-xl bg-[#faf7f4] px-2 py-2.5 text-center lg:min-w-[300px]"><div><p className="text-[14px] font-extrabold tabular-nums text-[#242424]">{transfer.items.length}</p><p className="text-[8.5px] text-[#94867c]">Variants</p></div><div><p className="text-[14px] font-extrabold tabular-nums text-[#242424]">{requested}</p><p className="text-[8.5px] text-[#94867c]">Requested</p></div><div><p className="text-[14px] font-extrabold tabular-nums text-[#242424]">{received}</p><p className="text-[8.5px] text-[#94867c]">Received</p></div></div>
      </div>
      <details className="group mt-3"><summary className="w-fit cursor-pointer list-none text-[10px] font-bold text-[#C85956] hover:underline [&::-webkit-details-marker]:hidden">View {transfer.items.length} {transfer.items.length === 1 ? "variant" : "variants"}</summary><ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{transfer.items.map((item) => <li key={item.id} className="rounded-xl bg-[#faf7f4] px-3 py-2.5"><p className="truncate text-[10.5px] font-bold text-[#51473f]">{item.productName}{item.optionLabel ? ` · ${item.optionLabel}` : ""}</p><p className="mt-1 text-[9px] tabular-nums text-[#91837a]">Requested {item.requestedQty}{item.receivedOkQty != null ? ` · Received ${item.receivedOkQty}` : ""}</p></li>)}</ul></details>
      {transfer.receivingNote && <p className="mt-3 rounded-xl bg-[#faf7f4] px-3 py-2 text-[9.5px] text-[#756960]">Zakhnook note: {transfer.receivingNote}</p>}
    </article>;
  })}</div><Pager page={safePage} count={transfers.length} onPage={setPage} /></>;
}

export default function WarehouseExperience({ variants, transfers, brandParam }: { variants: WarehouseVariantRow[]; transfers: WarehouseTransferRow[]; brandParam?: string }) {
  const router = useRouter();
  const [view, setView] = useState<WorkspaceView>("requests");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const [returnPage, setReturnPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const returnOperationKey = useRef(crypto.randomUUID());

  const inbound = useMemo(() => transfers.filter((item) => item.direction === "to_local"), [transfers]);
  const filteredVariants = useMemo(() => variants.filter((variant) => !deferredQuery || `${variant.productName} ${variant.optionLabel} ${variant.sku}`.toLocaleLowerCase().includes(deferredQuery)), [deferredQuery, variants]);
  const safeReturnPage = Math.min(returnPage, Math.max(1, Math.ceil(filteredVariants.length / PAGE_SIZE)));
  const visibleVariants = filteredVariants.slice((safeReturnPage - 1) * PAGE_SIZE, safeReturnPage * PAGE_SIZE);
  const availableUnits = variants.reduce((sum, item) => sum + item.quantity, 0);
  const incomingUnits = variants.reduce((sum, item) => sum + item.pendingRequestedQty, 0);
  const openRequests = inbound.filter((item) => OPEN_STATUSES.has(item.status)).length;

  function toggleVariant(id: string, checked: boolean) {
    setSelected((current) => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next; });
  }

  async function submitReturn() {
    const items = [...selected].map((variantId) => ({ variantId, requestedQty: quantities[variantId] ?? 0 })).filter((item) => item.requestedQty > 0);
    if (!items.length) return setError("Enter a positive quantity for at least one selected variant.");
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(withBrand("/api/brand-portal/warehouse/returns", brandParam), { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": returnOperationKey.current }, body: JSON.stringify({ items, note: note.trim() || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "We couldn't submit this return request.");
      setSelected(new Set()); setQuantities({}); setNote(""); setMessage("Return request submitted for warehouse review."); returnOperationKey.current = crypto.randomUUID(); router.refresh();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "We couldn't submit this return request."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <section aria-label="Warehouse summary" className="overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white"><div className="grid grid-cols-2 xl:grid-cols-4">{[
      ["Available at Zakhnook", availableUnits, "Sellable now"], ["Incoming", incomingUnits, "Awaiting receipt"], ["Open requests", openRequests, "Across all stages"], ["Documents", transfers.length, "Complete history"],
    ].map(([label, value, detail], index) => <div key={String(label)} className={`min-h-[92px] px-4 py-4 xl:px-5 ${index % 2 === 0 ? "border-r" : ""} ${index < 2 ? "border-b xl:border-b-0" : ""} ${index < 3 ? "xl:border-r" : ""} border-[#eee7e1]`}><p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#8d8076]">{label}</p><p className={`mt-1 text-[23px] font-extrabold tabular-nums tracking-[-0.04em] ${index === 1 && Number(value) > 0 ? "text-[#C85956]" : "text-[#242424]"}`}>{value}</p><p className="mt-1 text-[9.5px] text-[#94867c]">{detail}</p></div>)}</div></section>

    <nav aria-label="Warehouse views" className="flex w-fit items-center gap-1 rounded-xl bg-[#eee7e1] p-1">{(["requests", "returns", "history"] as WorkspaceView[]).map((item) => <button key={item} type="button" aria-pressed={view === item} onClick={() => { setView(item); setError(""); setMessage(""); }} className={`rounded-lg px-4 py-2 text-[11px] font-bold capitalize transition-colors ${view === item ? "bg-white text-[#242424] shadow-[0_1px_4px_rgba(72,50,36,.09)]" : "text-[#776a61] hover:text-[#242424]"}`}>{item}</button>)}</nav>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] font-semibold text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] font-semibold text-emerald-800">{message}</p>}

    {view === "requests" && <section className="overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white"><header className="border-b border-[#eee7e1] px-4 py-4 sm:px-5"><p className="text-[11.5px] font-extrabold text-[#302924]">Restock requests</p><p className="mt-1 text-[10px] text-[#8d8076]">Create replenishment requests from Inventory; follow every warehouse stage here.</p></header><TransferList transfers={inbound} emptyTitle="No restock requests yet" emptyDescription="Select variants from Inventory when you are ready to send stock to Zakhnook." /></section>}

    {view === "returns" && <section className="overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white"><header className="flex flex-col gap-3 border-b border-[#eee7e1] px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5"><div><p className="text-[11.5px] font-extrabold text-[#302924]">Request stock back</p><p className="mt-1 text-[10px] text-[#8d8076]">Choose units currently available at Zakhnook.</p></div><label className="relative block sm:w-72"><span className="sr-only">Search variants</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a2948a]" /><input value={query} onChange={(event) => { setQuery(event.target.value); setReturnPage(1); }} autoComplete="off" placeholder="Product, variant or SKU…" className="h-10 w-full rounded-xl border border-[#e4d9d1] bg-[#fcfaf8] pl-9 pr-3 text-[11px] outline-none focus-visible:border-[#C85956]/50 focus-visible:ring-4 focus-visible:ring-[#C85956]/8" /></label></header>
      {visibleVariants.length ? <div className="divide-y divide-[#eee7e1]">{visibleVariants.map((variant) => { const checked = selected.has(variant.variantId); const max = Math.max(0, variant.quantity - variant.pendingReturnQty); return <article key={variant.variantId} className={`flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5 ${checked ? "bg-[#fff8f6]" : ""}`}><div className="flex min-w-0 flex-1 items-center gap-3"><input aria-label={`Select ${variant.sku} for return`} type="checkbox" checked={checked} disabled={max === 0} onChange={(event) => toggleVariant(variant.variantId, event.target.checked)} className="h-4 w-4 accent-[#C85956]" /><div className="min-w-0"><p className="truncate text-[11.5px] font-bold text-[#403730]">{variant.productName}</p><p className="mt-1 truncate text-[9.5px] text-[#91837a]">{variant.optionLabel || "Default variant"} · {variant.sku}</p></div></div><div className="flex items-center justify-between gap-4 sm:justify-end"><div className="text-right"><p className="text-[14px] font-extrabold tabular-nums text-[#242424]">{max}</p><p className="text-[8.5px] text-[#94867c]">Available to return</p></div><label><span className="sr-only">Return quantity for {variant.sku}</span><input type="number" inputMode="numeric" min={1} max={max} step={1} disabled={!checked} value={quantities[variant.variantId] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [variant.variantId]: Math.max(0, Math.min(max, Math.trunc(Number(event.target.value) || 0))) }))} className="h-9 w-24 rounded-xl border border-[#e4d9d1] px-3 text-[11px] font-bold tabular-nums outline-none focus-visible:border-[#C85956]/50 disabled:bg-[#f7f3ef]" placeholder="Qty" /></label></div></article>; })}</div> : <DashboardEmptyState title="No matching variants" description="Try another product name, option or SKU." />}
      <Pager page={safeReturnPage} count={filteredVariants.length} onPage={setReturnPage} />
      {selected.size > 0 && <div className="border-t border-[#e8dfd8] bg-[#fcfaf8] p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1"><span className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#8d8076]">Return note <span className="font-medium normal-case tracking-normal">(optional)</span></span><input value={note} onChange={(event) => setNote(event.target.value)} autoComplete="off" placeholder="Reason or pickup preference…" className="mt-1.5 h-10 w-full rounded-xl border border-[#e4d9d1] bg-white px-3 text-[11px] outline-none focus-visible:border-[#C85956]/50" /></label><button type="button" onClick={submitReturn} disabled={busy} className="inline-flex h-10 items-center justify-center rounded-xl bg-[#C85956] px-4 text-[10.5px] font-bold text-white hover:bg-[#b84e4b] disabled:opacity-50">{busy ? <><Loader2 aria-hidden="true" className="mr-2 h-3.5 w-3.5 animate-spin" />Submitting…</> : `Request return · ${selected.size}`}</button></div></div>}
    </section>}

    {view === "history" && <section className="overflow-hidden rounded-[20px] border border-[#eadfd7] bg-white"><header className="border-b border-[#eee7e1] px-4 py-4 sm:px-5"><p className="text-[11.5px] font-extrabold text-[#302924]">Transfer history</p><p className="mt-1 text-[10px] text-[#8d8076]">Every inbound replenishment and outbound return in one audit trail.</p></header><TransferList transfers={transfers} emptyTitle="No warehouse documents yet" emptyDescription="Restock requests and returns will appear here." /></section>}
  </div>;
}
