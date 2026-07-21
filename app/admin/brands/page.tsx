import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard, Pencil, Plus } from "lucide-react";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import DeleteEntityButton from "@/components/admin/DeleteEntityButton";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel, dashboardButtonPrimary } from "@/components/dashboard/DashboardUI";

type BrandSearchParams = { q?: string; category?: string; ownership?: string; city?: string; sort?: string };

export default async function AdminBrandsPage(props: { searchParams: Promise<BrandSearchParams> }) {
  const params = await props.searchParams;
  const allBrands = await getAllBrandsForAdmin();
  const query = params.q?.trim().toLowerCase();
  const brands = allBrands.filter((brand) => {
    if (query && !`${brand.name} ${brand.slug} ${brand.category} ${brand.city}`.toLowerCase().includes(query)) return false;
    if (params.category && brand.category !== params.category) return false;
    if (params.city && brand.city !== params.city) return false;
    if (params.ownership === "linked" && !brand.ownerUserId) return false;
    if (params.ownership === "unlinked" && brand.ownerUserId) return false;
    return true;
  });
  brands.sort((a, b) => params.sort === "name" ? a.name.localeCompare(b.name) : params.sort === "city" ? a.city.localeCompare(b.city) : 0);
  const categories = [...new Set(allBrands.map((brand) => brand.category).filter(Boolean))].sort();
  const cities = [...new Set(allBrands.map((brand) => brand.city).filter(Boolean))].sort();
  const activeCount = [params.q, params.category, params.ownership, params.city, params.sort].filter(Boolean).length;

  return (
    <div>
      <DashboardPageHeader eyebrow="Brands" title={`All brands (${brands.length})`} description={`${allBrands.length} marketplace brands. Review ownership links and open any brand's portal without changing its public page.`} actions={<Link href="/admin/brands/new" className={dashboardButtonPrimary}><Plus className="mr-2 h-4 w-4" />Add brand</Link>} />
      <DashboardFilters action="/admin/brands" clearHref="/admin/brands" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Brand, slug or category" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        <DashboardFilterField label="Category"><select name="category" defaultValue={params.category ?? ""} className={dashboardFilterControl}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="City"><select name="city" defaultValue={params.city ?? ""} className={dashboardFilterControl}><option value="">All cities</option>{cities.map((value) => <option key={value}>{value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Owner account"><select name="ownership" defaultValue={params.ownership ?? ""} className={dashboardFilterControl}><option value="">Any ownership</option><option value="linked">Linked</option><option value="unlinked">Not linked</option></select></DashboardFilterField>
        <DashboardFilterField label="Sort"><select name="sort" defaultValue={params.sort ?? ""} className={dashboardFilterControl}><option value="">Newest</option><option value="name">Name A–Z</option><option value="city">City A–Z</option></select></DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {brands.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-[13px]"><thead className="border-b border-slate-200 bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-3 font-semibold">Brand</th><th className="px-5 py-3 font-semibold">Category</th><th className="px-5 py-3 font-semibold">City</th><th className="px-5 py-3 font-semibold">Owner account</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{brands.map((brand) => (
          <tr key={brand.slug} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="relative h-11 w-11 overflow-hidden rounded-xl bg-slate-100"><Image src={brand.heroImage} alt={brand.name} fill className="object-cover" /></div><div><p className="font-bold text-slate-900">{brand.name}</p><p className="mt-0.5 text-[11px] text-slate-500">/{brand.slug}</p></div></div></td><td className="px-5 py-4 text-slate-600">{brand.category}</td><td className="px-5 py-4 text-slate-600">{brand.city}</td><td className="px-5 py-4">{brand.ownerEmail ? <div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold text-emerald-700">Linked</span><p className="mt-1.5 text-[10.5px] text-slate-500">{brand.ownerEmail}</p></div> : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700">Not linked</span>}</td><td className="px-5 py-4"><div className="flex items-center justify-end gap-1"><Link href={`/brand-portal?brand=${brand.slug}`} aria-label={`View ${brand.name}'s portal`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><LayoutDashboard className="h-4 w-4" /></Link><Link href={`/admin/brands/${brand.slug}/edit`} aria-label={`Edit ${brand.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil className="h-4 w-4" /></Link><DeleteEntityButton apiPath={`/api/admin/brands/${brand.slug}`} name={brand.name} /></div></td></tr>
        ))}</tbody></table></div> : <DashboardEmptyState title="No matching brands" description={activeCount ? "Clear or adjust the filters to see more brands." : "Create the first brand to begin building the marketplace catalog."} />}
      </DashboardPanel>
    </div>
  );
}
