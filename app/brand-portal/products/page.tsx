import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Pencil, Plus } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getProductsForBrand } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import { formatPrice } from "@/lib/format";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import ProductPauseToggle from "@/components/brand-portal/ProductPauseToggle";
import RequestDeletionButton from "@/components/brand-portal/RequestDeletionButton";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel, dashboardButtonPrimary } from "@/components/dashboard/DashboardUI";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  pending_review: { label: "Pending Review", className: "bg-amber-50 text-amber-700" },
  changes_requested: { label: "Changes Requested", className: "bg-red-50 text-red-700" },
  published: { label: "Published", className: "bg-emerald-50 text-emerald-700" },
  archived: { label: "Archived", className: "bg-slate-100 text-slate-600" },
};
type ProductParams = { brand?: string; q?: string; status?: string; category?: string; productType?: string; collection?: string; inventory?: string; featured?: string; sort?: string };

export default async function BrandPortalProductsPage(props: { searchParams: Promise<ProductParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandSlug) { const brands = await getAllBrandsForAdmin(); return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />; }
  const allProducts = await getProductsForBrand(owner.brandSlug, owner.isImpersonating);
  const query = params.q?.trim().toLowerCase();
  const products = allProducts.filter((product) => {
    if (query && !product.name.toLowerCase().includes(query)) return false;
    if (params.status && product.status !== params.status) return false;
    if (params.category && product.category !== params.category) return false;
    if (params.productType && product.productType !== params.productType) return false;
    if (params.collection && product.collection !== params.collection) return false;
    if (params.inventory === "in" && !product.inStock) return false;
    if (params.inventory === "out" && product.inStock) return false;
    if (params.featured === "yes" && !product.featured) return false;
    if (params.featured === "no" && product.featured) return false;
    return true;
  });
  products.sort((a, b) => params.sort === "name" ? a.name.localeCompare(b.name) : params.sort === "price-asc" ? a.price - b.price : params.sort === "price-desc" ? b.price - a.price : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
  const categories = unique(allProducts.map((product) => product.category));
  const productTypes = unique(allProducts.map((product) => product.productType));
  const collections = unique(allProducts.map((product) => product.collection));
  const activeCount = [params.q, params.status, params.category, params.productType, params.collection, params.inventory, params.featured, params.sort].filter(Boolean).length;
  const brandParam = owner.isImpersonating ? `?brand=${owner.brandSlug}` : "";

  return (
    <div>
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader eyebrow="Catalog" title={`Products (${products.length})`} description={`${allProducts.length} products in your catalog. Product changes continue to use the existing Mahaly review workflow.`} actions={<Link href={`/brand-portal/products/new${brandParam}`} className={dashboardButtonPrimary}><Plus className="mr-2 h-4 w-4" />Add product</Link>} />
      <DashboardFilters action="/brand-portal/products" clearHref={`/brand-portal/products${brandParam}`} activeCount={activeCount}>
        {owner.isImpersonating && <input type="hidden" name="brand" value={owner.brandSlug} />}
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Product name" className={`${dashboardFilterControl} w-full lg:min-w-[220px]`} /></DashboardFilterField>
        <DashboardFilterField label="Status"><select name="status" defaultValue={params.status ?? ""} className={dashboardFilterControl}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, info]) => <option key={value} value={value}>{info.label}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Category"><select name="category" defaultValue={params.category ?? ""} className={dashboardFilterControl}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Product type"><select name="productType" defaultValue={params.productType ?? ""} className={dashboardFilterControl}><option value="">All types</option>{productTypes.map((value) => <option key={value}>{value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Collection"><select name="collection" defaultValue={params.collection ?? ""} className={dashboardFilterControl}><option value="">All collections</option>{collections.map((value) => <option key={value}>{value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Inventory"><select name="inventory" defaultValue={params.inventory ?? ""} className={dashboardFilterControl}><option value="">Any stock</option><option value="in">In stock</option><option value="out">Out of stock</option></select></DashboardFilterField>
        <DashboardFilterField label="Featured"><select name="featured" defaultValue={params.featured ?? ""} className={dashboardFilterControl}><option value="">Any</option><option value="yes">Featured</option><option value="no">Not featured</option></select></DashboardFilterField>
        <DashboardFilterField label="Sort"><select name="sort" defaultValue={params.sort ?? ""} className={dashboardFilterControl}><option value="">Newest</option><option value="name">Name A–Z</option><option value="price-asc">Price low to high</option><option value="price-desc">Price high to low</option></select></DashboardFilterField>
      </DashboardFilters>
      <DashboardPanel className="mt-6">
        {products.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-[13px]"><thead className="border-b border-[#e8e0d7] bg-[#fbf8f4] text-[10.5px] uppercase tracking-[0.08em] text-[#897b70]"><tr><th className="px-5 py-3 font-semibold">Product</th><th className="px-5 py-3 font-semibold">Category</th><th className="px-5 py-3 font-semibold">Price</th><th className="px-5 py-3 font-semibold">Inventory</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-[#eee7de]">{products.map((product) => {
          const statusInfo = STATUS_LABELS[product.status] ?? { label: product.status, className: "bg-slate-100 text-slate-600" };
          const editHref = `/brand-portal/products/${product.id}/edit${brandParam}`;
          return <tr key={product.id} className="hover:bg-[#fbf8f4]"><td className="px-5 py-4"><div className="flex items-center gap-3"><div className="relative h-11 w-11 flex-none overflow-hidden rounded-xl bg-[#f1eae2]"><Image src={product.image} alt={product.name} fill className="object-cover" /></div><div><p className="font-bold text-[#302b27]">{product.name}</p>{product.collection && <p className="mt-0.5 text-[11px] text-[#8a7d73]">{product.collection}</p>}</div></div></td><td className="px-5 py-4 text-[#75685f]"><p>{product.category ?? "—"}</p>{product.productType && <p className="mt-0.5 text-[11px] text-[#9b8e84]">{product.productType}</p>}</td><td className="px-5 py-4 font-bold text-[#302b27]">{formatPrice(product.price, product.currency)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${product.inStock ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{product.inStock ? "In stock" : "Out of stock"}</span></td><td className="px-5 py-4"><div className="flex flex-wrap gap-1.5"><span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${statusInfo.className}`}>{statusInfo.label}</span>{product.hasPendingEdit && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700">Edit pending</span>}{product.pausedByBrand && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-bold text-slate-600">Paused</span>}</div>{product.reviewNotes && <p className="mt-1.5 max-w-xs text-[11px] text-red-600">{product.reviewNotes}</p>}</td><td className="px-5 py-4"><div className="flex items-center justify-end gap-1">{product.status === "published" && <ProductPauseToggle productId={product.id} paused={product.pausedByBrand} />}<Link href={editHref} aria-label={`Edit ${product.name}`} className="rounded-lg p-2 text-[#8a7d73] hover:bg-[#f1eae2] hover:text-[#302b27]"><Pencil className="h-4 w-4" /></Link><RequestDeletionButton productId={product.id} name={product.name} alreadyRequested={Boolean(product.deletionRequestedAt)} /></div></td></tr>;
        })}</tbody></table></div> : <DashboardEmptyState title="No matching products" description={activeCount ? "Clear or adjust the filters to see more products." : "Add your first product to start building the catalog."} />}
      </DashboardPanel>
    </div>
  );
}
