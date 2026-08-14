import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, PackageOpen } from "lucide-react";
import { listRetiredProducts } from "@/lib/admin/productDeletion";
import { daysUntil } from "@/lib/format";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import RetiredProductRowActions from "@/components/admin/RetiredProductRowActions";

const PAGE_SIZE = 25;

type RetiredParams = { q?: string; page?: string };

// Admin's own Retired-tab — a single database-level paginated query
// (private.search_retired_products), never a full-catalog in-memory load.
export default async function AdminRetiredProductsPage(props: { searchParams: Promise<RetiredParams> }) {
  const params = await props.searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const result = await listRetiredProducts({ search: params.q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const activeCount = params.q ? 1 : 0;

  const pageHref = (targetPage: number) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (targetPage > 1) sp.set("page", String(targetPage));
    const qs = sp.toString();
    return `/admin/products/retired${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Commerce"
        title={`Retired products (${result.total})`}
        description="Retired products are hidden from customers immediately across every brand. Their order, review, and inventory history stays available — restoring one always brings it back as a Draft first."
      />
      <DashboardFilters action="/admin/products/retired" clearHref="/admin/products/retired" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Product, brand, SKU, or ID" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
      </DashboardFilters>
      <div className="mt-3">
        <Link href="/admin/products" className="text-[12.5px] font-semibold text-mahalyred hover:underline">← Back to all products</Link>
      </div>

      <DashboardPanel className="mt-3">
        {result.rows.length ? (
          <div className="divide-y divide-slate-100">
            {result.rows.map((row) => (
              <div key={row.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative block h-14 w-12 flex-none overflow-hidden rounded-lg bg-stone-100">
                    {row.image
                      ? <Image src={row.image} alt={row.name} fill sizes="80px" className="object-cover" />
                      : <span className="flex h-full w-full items-center justify-center text-slate-400"><PackageOpen className="h-4 w-4" aria-hidden="true" /></span>}
                  </span>
                  <div className="min-w-0">
                    <p className="max-w-[320px] truncate font-bold text-slate-900">{row.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{row.brandName} · {row.sku}</p>
                    <RetiredBadge row={row} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/admin/products/${row.id}/edit`} className="text-[12px] font-semibold text-ink hover:underline">Edit</Link>
                  <RetiredProductRowActions
                    productId={row.id}
                    productName={row.name}
                    canRestore={row.eligibility.canRestore}
                    canScheduleDeletion={row.eligibility.canScheduleDeletion}
                    hasActiveSchedule={Boolean(row.activeSchedule)}
                    hasActiveHold={row.eligibility.hasActiveHold}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <DashboardEmptyState title="No retired products" description={activeCount ? "Clear or adjust the search to find more retired products." : "Products retired by any brand will appear here."} />
        )}
      </DashboardPanel>

      {totalPages > 1 && (
        <nav aria-label="Retired product pages" className="mt-5 flex items-center justify-between gap-3">
          {page > 1
            ? <Link href={pageHref(page - 1)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</Link>
            : <span aria-disabled="true" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 text-[12.5px] font-semibold text-slate-400"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</span>}
          <p className="text-[12px] font-medium tabular-nums text-slate-500">Page {page} of {totalPages}</p>
          {page < totalPages
            ? <Link href={pageHref(page + 1)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
            : <span aria-disabled="true" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 text-[12.5px] font-semibold text-slate-400">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></span>}
        </nav>
      )}
    </div>
  );
}

function RetiredBadge({ row }: { row: { eligibility: { mustRetainHistory: boolean; canScheduleDeletion: boolean; hasActiveHold: boolean }; activeSchedule: { status: string; dueAt: string } | null } }) {
  const { eligibility, activeSchedule } = row;
  if (activeSchedule) {
    if (activeSchedule.status === "blocked") {
      return <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">Deletion paused</span>;
    }
    const daysLeft = daysUntil(activeSchedule.dueAt);
    return <span className="mt-1 inline-block rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">Scheduled · {daysLeft}d left</span>;
  }
  if (eligibility.mustRetainHistory) return <span className="mt-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-ink-soft/70">History retained</span>;
  if (eligibility.hasActiveHold) return <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">On hold</span>;
  if (eligibility.canScheduleDeletion) return <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Eligible for deletion</span>;
  return <span className="mt-1 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-ink-soft/70">Deletion blocked</span>;
}
