import Image from "next/image";
import Link from "next/link";
import { getLowStockVariantsForAdmin } from "@/lib/data/admin";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel } from "@/components/dashboard/DashboardUI";

type StockParams = { q?: string; brand?: string; level?: string; sort?: string };

export default async function AdminLowStockPage(props: { searchParams: Promise<StockParams> }) {
  const params = await props.searchParams;
  const allVariants = await getLowStockVariantsForAdmin();
  const query = params.q?.trim().toLowerCase();
  const variants = allVariants.filter((variant) => {
    if (query && !`${variant.productName} ${variant.color ?? ""} ${variant.size ?? ""}`.toLowerCase().includes(query)) return false;
    if (params.brand && variant.brandName !== params.brand) return false;
    if (params.level === "out" && variant.quantity > 0) return false;
    if (params.level === "low" && variant.quantity <= 0) return false;
    return true;
  });
  variants.sort((a, b) => params.sort === "stock-desc" ? b.quantity - a.quantity : params.sort === "product" ? a.productName.localeCompare(b.productName) : a.quantity - b.quantity);
  const brands = [...new Set(allVariants.map((variant) => variant.brandName))].sort();
  const activeCount = [params.q, params.brand, params.level, params.sort].filter(Boolean).length;
  return (
    <div>
      <DashboardPageHeader eyebrow="Commerce" title={`Low stock (${variants.length})`} description={`${allVariants.length} variants are currently at or below their configured stock threshold.`} />
      <DashboardFilters action="/admin/low-stock" clearHref="/admin/low-stock" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Product, color or size" className={`${dashboardFilterControl} w-full lg:min-w-[240px]`} /></DashboardFilterField>
        <DashboardFilterField label="Brand"><select name="brand" defaultValue={params.brand ?? ""} className={dashboardFilterControl}><option value="">All brands</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Urgency"><select name="level" defaultValue={params.level ?? ""} className={dashboardFilterControl}><option value="">All low stock</option><option value="out">Out of stock</option><option value="low">Low but available</option></select></DashboardFilterField>
        <DashboardFilterField label="Sort"><select name="sort" defaultValue={params.sort ?? ""} className={dashboardFilterControl}><option value="">Lowest stock</option><option value="stock-desc">Highest stock</option><option value="product">Product name</option></select></DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {variants.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[13px]"><thead className="border-b border-slate-200 bg-slate-50/80 text-[10.5px] uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-3 font-semibold">Product</th><th className="px-5 py-3 font-semibold">Variant</th><th className="px-5 py-3 font-semibold">Stock</th><th className="px-5 py-3 font-semibold">Threshold</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{variants.map((variant) => { const combo = [variant.color, variant.size].filter(Boolean).join(" / ") || "Default"; return <tr key={variant.variantId} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="relative h-11 w-11 flex-none overflow-hidden rounded-xl bg-slate-100"><Image src={variant.image} alt={variant.productName} fill className="object-cover" /></div><div><p className="font-bold text-slate-900">{variant.productName}</p><p className="mt-0.5 text-[11px] text-slate-500">{variant.brandName}</p></div></div></td><td className="px-5 py-4 text-slate-600">{combo}</td><td className="px-5 py-4"><span className={`text-lg font-bold ${variant.quantity <= 0 ? "text-red-700" : "text-amber-700"}`}>{variant.quantity}</span></td><td className="px-5 py-4 text-slate-600">{variant.lowStockThreshold}</td><td className="px-5 py-4 text-right"><Link href={`/admin/products/${variant.productId}/edit`} className="text-[12px] font-bold text-mahalyred hover:underline">Update product</Link></td></tr>; })}</tbody></table></div> : <DashboardEmptyState title="No matching low-stock variants" description={activeCount ? "Clear or adjust the filters to see more variants." : "Nothing is low on stock right now."} />}
      </DashboardPanel>
    </div>
  );
}
