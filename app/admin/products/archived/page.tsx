import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, PackageOpen } from "lucide-react";
import { listArchivedProducts } from "@/lib/admin/productDeletion";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import ArchivedProductRowActions from "@/components/admin/ArchivedProductRowActions";

const PAGE_SIZE = 25;
type ArchivedParams = { q?: string; page?: string };

export default async function AdminArchivedProductsPage(props: { searchParams: Promise<ArchivedParams> }) {
  const params = await props.searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const result = await listArchivedProducts({ search: params.q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  function pageHref(targetPage: number) {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (targetPage > 1) search.set("page", String(targetPage));
    return `/admin/products/archived${search.size ? `?${search}` : ""}`;
  }
  return <div>
    <DashboardPageHeader eyebrow="Commerce" title={`Archived products (${result.total})`} description="Archived is final. Permanent business history remains visible here; temporary blockers explain exactly what must be resolved before an eligible product can be deleted." />
    <DashboardFilters action="/admin/products/archived" clearHref="/admin/products/archived" activeCount={params.q ? 1 : 0}><DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Product, brand, SKU, or ID" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField><Link href="/admin/products" className="order-[3] inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#e5ddd5] bg-[#fcfaf8] px-3 text-[10.5px] font-bold text-[#75685f] hover:bg-white hover:text-[#C85956]"><ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />Products</Link></DashboardFilters>
    <DashboardPanel className="mt-4">
      {result.rows.length ? <div className="divide-y divide-slate-100">{result.rows.map((row) => <div key={row.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3"><span className="relative block h-14 w-12 flex-none overflow-hidden rounded-lg bg-stone-100">{row.image ? <Image src={row.image} alt={row.name} fill sizes="80px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-slate-400"><PackageOpen className="h-4 w-4" /></span>}</span><div className="min-w-0"><p className="truncate font-bold text-slate-900">{row.name}</p><p className="mt-0.5 text-[11px] text-slate-400">{row.brandName} · {row.sku}</p><ArchiveState eligibility={row.eligibility} /></div></div>
        <ArchivedProductRowActions productId={row.id} productName={row.name} eligibility={row.eligibility} audience="admin" />
      </div>)}</div> : <DashboardEmptyState title="No Archived products" description={params.q ? "Adjust the search to find more products." : "Archived products from every brand will appear here."} />}
    </DashboardPanel>
    {totalPages > 1 && <nav aria-label="Archived product pages" className="mt-5 flex items-center justify-between gap-3">{page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[12.5px] font-semibold"><ChevronLeft className="h-4 w-4" /> Previous</Link> : <span />}<p className="text-[12px] tabular-nums text-slate-500">Page {page} of {totalPages}</p>{page < totalPages ? <Link href={pageHref(page + 1)} className="inline-flex h-10 items-center gap-2 rounded-lg border px-4 text-[12.5px] font-semibold">Next <ChevronRight className="h-4 w-4" /></Link> : <span />}</nav>}
  </div>;
}

function ArchiveState({ eligibility }: { eligibility: { mustRetainHistory: boolean; hasTemporaryBlockers: boolean; canDeleteArchived: boolean } }) {
  if (eligibility.hasTemporaryBlockers) return <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">Temporarily blocked</span>;
  if (eligibility.mustRetainHistory) return <span className="mt-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">History retained</span>;
  if (eligibility.canDeleteArchived) return <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Safe to delete</span>;
  return null;
}
