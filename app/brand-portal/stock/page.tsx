import { redirect } from "next/navigation";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getInventoryHistoryForBrand, getVariantsForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";
import InventoryManager from "@/components/brand-portal/InventoryManager";

type StockParams = { brand?: string; q?: string; level?: string; sort?: string; product?: string };

export default async function BrandPortalStockPage(props: { searchParams: Promise<StockParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandSlug) { const brands = await getAllBrandsForAdmin(); return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />; }
  const allVariants = await getVariantsForBrand(owner.brandSlug, owner.isImpersonating);
  const history = await getInventoryHistoryForBrand(owner.brandId!, owner.isImpersonating);
  const query = params.q?.trim().toLowerCase();
  const variants = allVariants.filter((variant) => {
    if (query && !`${variant.productName} ${variant.color ?? ""} ${variant.size ?? ""}`.toLowerCase().includes(query)) return false;
    if (params.level === "healthy" && variant.stockStatus !== "in_stock") return false;
    if (params.level === "low" && variant.stockStatus !== "low_stock") return false;
    if (params.level === "out" && variant.stockStatus !== "out_of_stock") return false;
    if (params.product && variant.productId !== params.product) return false;
    return true;
  });
  variants.sort((a, b) => params.sort === "stock-asc" ? a.quantity - b.quantity : params.sort === "stock-desc" ? b.quantity - a.quantity : a.productName.localeCompare(b.productName));
  const activeCount = [params.q, params.level, params.sort, params.product].filter(Boolean).length;

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader eyebrow="Catalog" title={`Inventory (${variants.length})`} description={`${allVariants.length} variants. Adjustments are atomic and every change is recorded in inventory history.`} />
      <DashboardFilters action="/brand-portal/stock" clearHref={`/brand-portal/stock${owner.isImpersonating ? `?brand=${owner.brandSlug}` : ""}`} activeCount={activeCount}>
        {owner.isImpersonating && <input type="hidden" name="brand" value={owner.brandSlug} />}
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Product, color or size" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        <DashboardFilterField label="Stock level"><select name="level" defaultValue={params.level ?? ""} className={dashboardFilterControl}><option value="">All levels</option><option value="healthy">Healthy</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></DashboardFilterField>
        <DashboardFilterField label="Sort"><select name="sort" defaultValue={params.sort ?? ""} className={dashboardFilterControl}><option value="">Product name</option><option value="stock-asc">Lowest stock</option><option value="stock-desc">Highest stock</option></select></DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {variants.length ? <InventoryManager variants={variants} history={history} brandSlug={owner.brandSlug ?? undefined} /> : <DashboardEmptyState title="No matching inventory" description={activeCount ? "Clear or adjust the filters to see more variants." : "Product variants will appear here after catalog setup."} />}
      </DashboardPanel>
    </div>
  );
}
