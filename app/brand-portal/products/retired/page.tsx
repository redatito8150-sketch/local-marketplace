import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, PackageOpen } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { listRetiredProducts } from "@/lib/admin/productDeletion";
import { daysUntil } from "@/lib/format";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import ProductRowActions from "@/components/brand-portal/ProductRowActions";

const PAGE_SIZE = 25;

type RetiredParams = { brand?: string; q?: string; page?: string };

// Retired products' own, dedicated, database-paginated view — this is
// exactly what item 1's "accurate, database-backed counts and pagination
// for Retired products... do not load an entire large catalog into memory"
// requires. private.search_retired_products (supabase/migrations/
// 20260814020000_product_deletion_lifecycle.sql) applies brand/search/
// LIMIT/OFFSET entirely inside Postgres, and computes each row's
// deletion-eligibility badge via the same canonical function every
// mutation RPC uses.
export default async function RetiredProductsPage(props: { searchParams: Promise<RetiredParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandId) redirect("/brand-portal/products");

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const result = await listRetiredProducts({
    brandId: owner.brandId,
    search: params.q,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const brandParam = owner.isImpersonating ? `?brand=${owner.brandSlug}` : "";
  const activeCount = params.q ? 1 : 0;

  const pageHref = (targetPage: number) => {
    const sp = new URLSearchParams();
    if (owner.isImpersonating && owner.brandSlug) sp.set("brand", owner.brandSlug);
    if (params.q) sp.set("q", params.q);
    if (targetPage > 1) sp.set("page", String(targetPage));
    const qs = sp.toString();
    return `/brand-portal/products/retired${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-[1540px]">
      <DashboardPageHeader
        eyebrow="Catalog"
        title={`Retired products (${result.total})`}
        description="Retired products are hidden from customers immediately. Their sales, review, and inventory history stays available — restoring one always brings it back as a Draft first, so it goes through the normal publish checks again."
      />
      <DashboardFilters action="/brand-portal/products/retired" clearHref={`/brand-portal/products/retired${brandParam}`} activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1">
          <input name="q" defaultValue={params.q ?? ""} placeholder="Product name, SKU, or ID" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} />
        </DashboardFilterField>
        {owner.isImpersonating && owner.brandSlug && <input type="hidden" name="brand" value={owner.brandSlug} />}
      </DashboardFilters>
      <div className="mt-3">
        <Link href={`/brand-portal/products${brandParam}`} className="text-[12.5px] font-semibold text-mahalyred hover:underline">← Back to all products</Link>
      </div>

      <DashboardPanel className="mt-3 border-[#e3dcd3] bg-[#fffdf9] shadow-[0_10px_30px_rgba(67,45,29,0.04)]">
        {result.rows.length ? (
          <div className="divide-y divide-[#eee7de]">
            {result.rows.map((row) => (
              <div key={row.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="relative block h-16 w-14 flex-none overflow-hidden rounded-xl bg-[#f1eae2]">
                    {row.image
                      ? <Image src={row.image} alt={row.name} fill sizes="96px" className="object-cover" />
                      : <span className="flex h-full w-full items-center justify-center text-[#a29489]"><PackageOpen className="h-5 w-5" aria-hidden="true" /></span>}
                  </span>
                  <div className="min-w-0">
                    <p className="max-w-[320px] truncate font-bold text-[#242424]">{row.name}</p>
                    <p className="mt-1 text-[11.5px] text-[#8a7d73]">{row.sku}</p>
                    <RetiredBadge eligibility={row.eligibility} activeSchedule={row.activeSchedule} />
                  </div>
                </div>
                <ProductRowActions productId={row.id} name={row.name} editHref={`/brand-portal/products/${row.id}/edit${brandParam}`} />
              </div>
            ))}
          </div>
        ) : (
          <DashboardEmptyState
            title="No retired products"
            description={activeCount ? "Clear or adjust the search to find more retired products." : "Products you retire will appear here."}
          />
        )}
      </DashboardPanel>

      {totalPages > 1 && (
        <nav aria-label="Retired product pages" className="mt-5 flex items-center justify-between gap-3">
          {page > 1
            ? <Link href={pageHref(page - 1)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#ddd6cd] bg-[#fffdf9] px-4 text-[12.5px] font-semibold text-[#51473f] hover:bg-[#f1eae2]"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</Link>
            : <span aria-disabled="true" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e8e0d7] bg-[#f7f3ee] px-4 text-[12.5px] font-semibold text-[#b5aaa1]"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</span>}
          <p className="text-[12px] font-medium tabular-nums text-[#75685f]">Page {page} of {totalPages}</p>
          {page < totalPages
            ? <Link href={pageHref(page + 1)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#ddd6cd] bg-[#fffdf9] px-4 text-[12.5px] font-semibold text-[#51473f] hover:bg-[#f1eae2]">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
            : <span aria-disabled="true" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#e8e0d7] bg-[#f7f3ee] px-4 text-[12.5px] font-semibold text-[#b5aaa1]">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></span>}
        </nav>
      )}
    </div>
  );
}

// The secondary deletion-eligibility badge item 1 asks for, next to the
// primary "Retired" state: History retained / Deletion blocked / Eligible
// for deletion / Deletion scheduled · X days remaining — plain language,
// no raw database terminology.
function RetiredBadge({
  eligibility,
  activeSchedule,
}: {
  eligibility: { mustRetainHistory: boolean; canScheduleDeletion: boolean; hasActiveHold: boolean };
  activeSchedule: { status: string; dueAt: string } | null;
}) {
  if (activeSchedule) {
    if (activeSchedule.status === "blocked") {
      return <span className="mt-1.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">Deletion paused</span>;
    }
    const daysLeft = daysUntil(activeSchedule.dueAt);
    return <span className="mt-1.5 inline-block rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-700">Deletion scheduled · {daysLeft} {daysLeft === 1 ? "day" : "days"} remaining</span>;
  }
  if (eligibility.mustRetainHistory) {
    return <span className="mt-1.5 inline-block rounded-full bg-[#eee9e4] px-2 py-0.5 text-[10.5px] font-bold text-[#6f6259]">History retained</span>;
  }
  if (eligibility.hasActiveHold) {
    return <span className="mt-1.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">Deletion blocked</span>;
  }
  if (eligibility.canScheduleDeletion) {
    return <span className="mt-1.5 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">Eligible for deletion</span>;
  }
  return <span className="mt-1.5 inline-block rounded-full bg-[#eee9e4] px-2 py-0.5 text-[10.5px] font-bold text-[#6f6259]">Deletion blocked</span>;
}
