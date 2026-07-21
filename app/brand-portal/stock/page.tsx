import { redirect } from "next/navigation";
import Image from "next/image";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getVariantsForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";

type StockParams = { brand?: string; q?: string; level?: string; sort?: string };

export default async function BrandPortalStockPage(props: { searchParams: Promise<StockParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandSlug) { const brands = await getAllBrandsForAdmin(); return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />; }
  const allVariants = await getVariantsForBrand(owner.brandSlug, owner.isImpersonating);
  const query = params.q?.trim().toLowerCase();
  const variants = allVariants.filter((variant) => {
    if (query && !`${variant.productName} ${variant.color ?? ""} ${variant.size ?? ""}`.toLowerCase().includes(query)) return false;
    const low = variant.quantity > 0 && variant.quantity <= variant.lowStockThreshold;
    if (params.level === "healthy" && variant.quantity <= variant.lowStockThreshold) return false;
    if (params.level === "low" && !low) return false;
    if (params.level === "out" && variant.quantity > 0) return false;
    return true;
  });
  variants.sort((a, b) => params.sort === "stock-asc" ? a.quantity - b.quantity : params.sort === "stock-desc" ? b.quantity - a.quantity : a.productName.localeCompare(b.productName));
  const activeCount = [params.q, params.level, params.sort].filter(Boolean).length;

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader eyebrow="Catalog" title={`Inventory (${variants.length})`} description={`${allVariants.length} variants. Inventory remains read-only in the portal, preserving the current centralized update workflow.`} />
      <DashboardFilters action="/brand-portal/stock" clearHref={`/brand-portal/stock${owner.isImpersonating ? `?brand=${owner.brandSlug}` : ""}`} activeCount={activeCount}>
        {owner.isImpersonating && <input type="hidden" name="brand" value={owner.brandSlug} />}
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Product, color or size" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        <DashboardFilterField label="Stock level"><select name="level" defaultValue={params.level ?? ""} className={dashboardFilterControl}><option value="">All levels</option><option value="healthy">Healthy</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></DashboardFilterField>
        <DashboardFilterField label="Sort"><select name="sort" defaultValue={params.sort ?? ""} className={dashboardFilterControl}><option value="">Product name</option><option value="stock-asc">Lowest stock</option><option value="stock-desc">Highest stock</option></select></DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {variants.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-[13px]"><thead className="border-b border-[#e8e0d7] bg-[#fbf8f4] text-[10.5px] uppercase tracking-[0.08em] text-[#897b70]"><tr><th className="px-5 py-3 font-semibold">Product</th><th className="px-5 py-3 font-semibold">Variant</th><th className="px-5 py-3 font-semibold">Available</th><th className="px-5 py-3 font-semibold">Threshold</th><th className="px-5 py-3 font-semibold">Status</th></tr></thead><tbody className="divide-y divide-[#eee7de]">{variants.map((variant) => {
          const combo = [variant.color, variant.size].filter(Boolean).join(" / ") || "Default";
          const out = variant.quantity <= 0; const low = !out && variant.quantity <= variant.lowStockThreshold;
          return <tr key={variant.variantId} className="hover:bg-[#fbf8f4]"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="relative h-11 w-11 flex-none overflow-hidden rounded-xl bg-[#f1eae2]"><Image src={variant.image} alt={variant.productName} fill className="object-cover" /></div><p className="font-bold text-[#302b27]">{variant.productName}</p></div></td><td className="px-5 py-4 text-[#75685f]">{combo}</td><td className="px-5 py-4 text-lg font-bold text-[#302b27]">{variant.quantity}</td><td className="px-5 py-4 text-[#75685f]">{variant.lowStockThreshold}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${out ? "bg-red-50 text-red-700" : low ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{out ? "Out of stock" : low ? "Low stock" : "Healthy"}</span></td></tr>;
        })}</tbody></table></div> : <DashboardEmptyState title="No matching inventory" description={activeCount ? "Clear or adjust the filters to see more variants." : "Product variants will appear here after catalog setup."} />}
      </DashboardPanel>
    </div>
  );
}
