import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { listProductDeletionHistory } from "@/lib/admin/productDeletion";
import { formatDateTime } from "@/lib/format";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";

const PAGE_SIZE = 25;

export default async function ProductDeletionHistoryPage(props: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await props.searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const result = await listProductDeletionHistory({ search: params.q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  function pageHref(target: number) {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (target > 1) search.set("page", String(target));
    return `/admin/products/deletion-history${search.size ? `?${search}` : ""}`;
  }
  return <div>
    <DashboardPageHeader eyebrow="Audit" title={`Product deletion history (${result.total})`} description="An immutable snapshot of every product that was actually removed, including who deleted it, its previous state, and how many media cleanup jobs were queued." />
    <DashboardFilters action="/admin/products/deletion-history" clearHref="/admin/products/deletion-history" activeCount={params.q ? 1 : 0}><DashboardFilterField label="Search"><input name="q" defaultValue={params.q ?? ""} placeholder="Product name, SKU, or ID" className={`${dashboardFilterControl} min-w-[280px]`} /></DashboardFilterField></DashboardFilters>
    <div className="mt-3"><Link href="/admin/products" className="text-[12.5px] font-semibold text-[#C85956] hover:underline">← Back to products</Link></div>
    <DashboardPanel className="mt-3">{result.rows.length ? <div className="divide-y divide-slate-100">{result.rows.map((row) => <div key={row.id} className="grid gap-2 p-4 md:grid-cols-[minmax(220px,1fr)_160px_180px] md:items-center sm:p-5"><div><p className="font-bold text-slate-900">{row.product_name_snapshot}</p><p className="mt-1 text-[11px] text-slate-500">{row.product_sku_snapshot ?? row.product_id_snapshot}</p>{row.reason && <p className="mt-1 text-[11.5px] text-slate-600">{row.reason}</p>}</div><div><span className="rounded-full bg-stone-100 px-2 py-1 text-[10.5px] font-bold text-slate-600">Deleted from {row.deleted_from === "draft" ? "Draft" : "Archived"}</span><p className="mt-2 text-[11px] text-slate-500">{row.media_jobs_queued} media cleanup job(s)</p></div><div className="text-[11.5px] text-slate-600"><p>{formatDateTime(row.deleted_at)}</p><p className="mt-1">by {row.deleted_by_label}</p></div></div>)}</div> : <DashboardEmptyState title="No product deletions" description="Products that are permanently deleted will be recorded here." />}</DashboardPanel>
    {totalPages > 1 && <nav className="mt-5 flex items-center justify-between"><span>{page > 1 && <Link href={pageHref(page - 1)} className="inline-flex items-center gap-2 text-[12px] font-semibold"><ChevronLeft className="h-4 w-4" /> Previous</Link>}</span><p className="text-[12px] text-slate-500">Page {page} of {totalPages}</p><span>{page < totalPages && <Link href={pageHref(page + 1)} className="inline-flex items-center gap-2 text-[12px] font-semibold">Next <ChevronRight className="h-4 w-4" /></Link>}</span></nav>}
  </div>;
}
