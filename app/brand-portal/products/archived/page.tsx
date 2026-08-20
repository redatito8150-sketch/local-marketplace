import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, PackageOpen } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { listArchivedProducts } from "@/lib/admin/productDeletion";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import ArchivedProductRowActions from "@/components/admin/ArchivedProductRowActions";

const PAGE_SIZE = 25;
type ArchivedParams = { brand?: string; q?: string; page?: string };

export default async function ArchivedProductsPage(props: { searchParams: Promise<ArchivedParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) return redirect("/account");
  if (!owner.brandId) return redirect("/brand-portal/products");
  const activeOwner = owner;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const result = await listArchivedProducts({ brandId: owner.brandId, search: params.q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const brandParam = owner.isImpersonating ? `?brand=${owner.brandSlug}` : "";

  function pageHref(targetPage: number) {
    const search = new URLSearchParams();
    if (activeOwner.isImpersonating && activeOwner.brandSlug) search.set("brand", activeOwner.brandSlug);
    if (params.q) search.set("q", params.q);
    if (targetPage > 1) search.set("page", String(targetPage));
    return `/brand-portal/products/archived${search.size ? `?${search}` : ""}`;
  }

  return (
    <div className="mx-auto max-w-[1540px]">
      <DashboardPageHeader eyebrow="Catalog" title={`Archived products (${result.total})`} description="Archived products are hidden permanently. Products with business history stay here for audit; history-free products can be deleted immediately once temporary blockers are resolved." />
      <DashboardFilters action="/brand-portal/products/archived" clearHref={`/brand-portal/products/archived${brandParam}`} activeCount={params.q ? 1 : 0}>
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Product name, SKU, or ID" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        {owner.isImpersonating && owner.brandSlug && <input type="hidden" name="brand" value={owner.brandSlug} />}
        <Link href={`/brand-portal/products${brandParam}`} className="order-[3] inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#e5ddd5] bg-[#fcfaf8] px-3 text-[10.5px] font-bold text-[#75685f] hover:bg-white hover:text-[#C85956]"><ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />Products</Link>
      </DashboardFilters>
      <DashboardPanel className="mt-4 border-[#e3dcd3] bg-[#fffdf9]">
        {result.rows.length ? <div className="divide-y divide-[#eee7de]">
          {result.rows.map((row) => (
            <div key={row.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-start lg:justify-between sm:p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative block h-16 w-14 flex-none overflow-hidden rounded-xl bg-[#f1eae2]">{row.image ? <Image src={row.image} alt={row.name} fill sizes="96px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-[#a29489]"><PackageOpen className="h-5 w-5" /></span>}</span>
                <div className="min-w-0"><p className="truncate font-bold text-[#242424]">{row.name}</p><p className="mt-1 text-[11.5px] text-[#8a7d73]">{row.sku}</p><ArchiveState eligibility={row.eligibility} /></div>
              </div>
              <ArchivedProductRowActions productId={row.id} productName={row.name} eligibility={row.eligibility} audience="brand" readOnly={owner.isImpersonating} />
            </div>
          ))}
        </div> : <DashboardEmptyState title="No Archived products" description={params.q ? "Adjust the search to find more products." : "Products you Archive will appear here."} />}
      </DashboardPanel>

      {totalPages > 1 && <nav aria-label="Archived product pages" className="mt-5 flex items-center justify-between gap-3">
        {page > 1 ? <Link href={pageHref(page - 1)} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[12.5px] font-semibold"><ChevronLeft className="h-4 w-4" /> Previous</Link> : <span />}
        <p className="text-[12px] tabular-nums text-[#75685f]">Page {page} of {totalPages}</p>
        {page < totalPages ? <Link href={pageHref(page + 1)} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[12.5px] font-semibold">Next <ChevronRight className="h-4 w-4" /></Link> : <span />}
      </nav>}
    </div>
  );
}

function ArchiveState({ eligibility }: { eligibility: { mustRetainHistory: boolean; hasTemporaryBlockers: boolean; canDeleteArchived: boolean } }) {
  if (eligibility.hasTemporaryBlockers) return <span className="mt-1.5 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-800">Temporarily blocked</span>;
  if (eligibility.mustRetainHistory) return <span className="mt-1.5 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10.5px] font-bold text-[#6f6259]">History retained</span>;
  if (eligibility.canDeleteArchived) return <span className="mt-1.5 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">Safe to delete</span>;
  return null;
}
