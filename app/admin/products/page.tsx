import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { getAllProductsForAdmin } from "@/lib/data/admin";
import BulkProductActions from "@/components/admin/BulkProductActions";
import DashboardFilters, { DashboardFilterField, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";
import { DashboardPageHeader, dashboardButtonPrimary, dashboardButtonSecondary } from "@/components/dashboard/DashboardUI";

type ProductSearchParams = {
  q?: string; status?: string; brand?: string; category?: string; productType?: string;
  collection?: string; inventory?: string; featured?: string; minPrice?: string; maxPrice?: string; sort?: string;
};

export default async function AdminProductsPage(props: { searchParams: Promise<ProductSearchParams> }) {
  const params = await props.searchParams;
  const allProducts = await getAllProductsForAdmin();
  const normalizedQuery = params.q?.trim().toLowerCase();
  const minPrice = params.minPrice ? Number(params.minPrice) : undefined;
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : undefined;
  const filteredProducts = allProducts.filter((product) => {
    if (normalizedQuery && !`${product.name} ${product.brandName} ${product.sku}`.toLowerCase().includes(normalizedQuery)) return false;
    if (params.status && product.status !== params.status) return false;
    if (params.brand && product.brandSlug !== params.brand) return false;
    if (params.category && product.category !== params.category) return false;
    if (params.productType && product.productType !== params.productType) return false;
    if (params.collection && product.collection !== params.collection) return false;
    if (params.inventory === "in" && !product.inStock) return false;
    if (params.inventory === "out" && product.inStock) return false;
    if (params.featured === "yes" && !product.featured) return false;
    if (params.featured === "no" && product.featured) return false;
    if (minPrice !== undefined && Number.isFinite(minPrice) && product.price < minPrice) return false;
    if (maxPrice !== undefined && Number.isFinite(maxPrice) && product.price > maxPrice) return false;
    return true;
  });
  filteredProducts.sort((a, b) => params.sort === "price-asc" ? a.price - b.price : params.sort === "price-desc" ? b.price - a.price : params.sort === "name" ? a.name.localeCompare(b.name) : 0);

  const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
  const brands = unique(allProducts.map((product) => product.brandSlug));
  const brandLabels = new Map(allProducts.map((product) => [product.brandSlug, product.brandName]));
  const categories = unique(allProducts.map((product) => product.category));
  const productTypes = unique(allProducts.map((product) => product.productType));
  const collections = unique(allProducts.map((product) => product.collection));
  const activeCount = [params.q, params.status, params.brand, params.category, params.productType, params.collection, params.inventory, params.featured, params.minPrice, params.maxPrice, params.sort].filter(Boolean).length;

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Commerce"
        title={`Products (${filteredProducts.length})`}
        description={`${allProducts.length} products in the full catalog. Search and filter without changing product data.`}
        actions={<>
          {/* A file download endpoint, not a navigable page. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/admin/products/export" className={dashboardButtonSecondary}><Download className="mr-2 h-4 w-4" />Export CSV</a>
          <Link href="/admin/products/new" className={dashboardButtonPrimary}><Plus className="mr-2 h-4 w-4" />Add product</Link>
        </>}
      />
      <DashboardFilters action="/admin/products" clearHref="/admin/products" activeCount={activeCount}>
        <DashboardFilterField label="Search" className="lg:flex-1"><input name="q" defaultValue={params.q ?? ""} placeholder="Product, brand or SKU" className={`${dashboardFilterControl} w-full lg:min-w-[220px]`} /></DashboardFilterField>
        <DashboardFilterField label="Status"><select name="status" defaultValue={params.status ?? ""} className={dashboardFilterControl}><option value="">All statuses</option>{["draft","pending_review","changes_requested","published","archived"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Brand"><select name="brand" defaultValue={params.brand ?? ""} className={dashboardFilterControl}><option value="">All brands</option>{brands.map((value) => <option key={value} value={value}>{brandLabels.get(value) ?? value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Category"><select name="category" defaultValue={params.category ?? ""} className={dashboardFilterControl}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Product type"><select name="productType" defaultValue={params.productType ?? ""} className={dashboardFilterControl}><option value="">All types</option>{productTypes.map((value) => <option key={value}>{value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Collection"><select name="collection" defaultValue={params.collection ?? ""} className={dashboardFilterControl}><option value="">All collections</option>{collections.map((value) => <option key={value}>{value}</option>)}</select></DashboardFilterField>
        <DashboardFilterField label="Inventory"><select name="inventory" defaultValue={params.inventory ?? ""} className={dashboardFilterControl}><option value="">Any stock</option><option value="in">In stock</option><option value="out">Out of stock</option></select></DashboardFilterField>
        <DashboardFilterField label="Featured"><select name="featured" defaultValue={params.featured ?? ""} className={dashboardFilterControl}><option value="">Any</option><option value="yes">Featured</option><option value="no">Not featured</option></select></DashboardFilterField>
        <DashboardFilterField label="Min price"><input name="minPrice" type="number" min="0" defaultValue={params.minPrice ?? ""} className={`${dashboardFilterControl} lg:min-w-[110px]`} /></DashboardFilterField>
        <DashboardFilterField label="Max price"><input name="maxPrice" type="number" min="0" defaultValue={params.maxPrice ?? ""} className={`${dashboardFilterControl} lg:min-w-[110px]`} /></DashboardFilterField>
        <DashboardFilterField label="Sort"><select name="sort" defaultValue={params.sort ?? ""} className={dashboardFilterControl}><option value="">Newest</option><option value="name">Name A–Z</option><option value="price-asc">Price low to high</option><option value="price-desc">Price high to low</option></select></DashboardFilterField>
      </DashboardFilters>
      <BulkProductActions products={filteredProducts} />
    </div>
  );
}
