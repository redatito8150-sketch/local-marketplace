import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getAllProductsForAdmin } from "@/lib/data/admin";
import { listArchivedProducts } from "@/lib/admin/productDeletion";
import { calculateStockStatus, effectiveLowStockThreshold } from "@/lib/inventory/stockStatus";
import BulkProductActions from "@/components/admin/BulkProductActions";
import ProductCatalogTools from "@/components/admin/ProductCatalogTools";
import ProductCatalogFilters, { type ProductCatalogFilterParams } from "@/components/products/ProductCatalogFilters";
import ProductQuickViews from "@/components/products/ProductQuickViews";
import { DashboardPageHeader, dashboardButtonPrimary } from "@/components/dashboard/DashboardUI";
import type { ProductRecord } from "@/types";
import { getProductPricePresentation } from "@/lib/products/pricingPresentation";
import { tableSortHref } from "@/components/dashboard/SortableTableHeader";

const PAGE_SIZE = 25;

type ProductSearchParams = ProductCatalogFilterParams & { page?: string };

function productNeedsAttention(product: ProductRecord) {
  if (product.status === "pending_review" || product.status === "changes_requested") return true;
  const variants = (product.variants ?? []).filter((variant) => !variant.isArchived && variant.sellingStatus === "active");
  return variants.some((variant) => calculateStockStatus(
    variant.quantity,
    effectiveLowStockThreshold(variant.lowStockThresholdOverride, product.defaultLowStockThreshold ?? 0)
  ) !== "in_stock");
}

export default async function AdminProductsPage(props: { searchParams: Promise<ProductSearchParams> }) {
  const params = await props.searchParams;
  const [allProductsWithArchived, archivedCount] = await Promise.all([
    getAllProductsForAdmin(),
    listArchivedProducts({ limit: 1 }).then((page) => page.total).catch(() => 0),
  ]);
  const allProducts = allProductsWithArchived.filter((product) => product.status !== "archived");
  const attentionProducts = allProducts.filter(productNeedsAttention);
  const normalizedQuery = params.q?.trim().toLowerCase();
  const minPrice = params.minPrice ? Number(params.minPrice) : undefined;
  const maxPrice = params.maxPrice ? Number(params.maxPrice) : undefined;
  const filteredProducts = allProducts.filter((product) => {
    const pricing = getProductPricePresentation(product);
    const variantSkus = product.variants?.map((variant) => variant.sku).join(" ") ?? "";
    if (normalizedQuery && !`${product.name} ${product.brandName} ${product.sku} ${variantSkus}`.toLowerCase().includes(normalizedQuery)) return false;
    if (params.status && product.status !== params.status) return false;
    if (params.brand && product.brandSlug !== params.brand) return false;
    if (params.category && product.mainCategory !== params.category) return false;
    if (params.productType && product.productTypeName !== params.productType) return false;
    if (params.collection && product.collectionName !== params.collection) return false;
    if (params.inventory === "in" && !product.inStock) return false;
    if (params.inventory === "out" && product.inStock) return false;
    if (params.featured === "yes" && !product.featured) return false;
    if (params.featured === "no" && product.featured) return false;
    if (params.attention && !productNeedsAttention(product)) return false;
    if (minPrice !== undefined && Number.isFinite(minPrice) && pricing.currentMin < minPrice) return false;
    if (maxPrice !== undefined && Number.isFinite(maxPrice) && pricing.currentMin > maxPrice) return false;
    return true;
  });
  filteredProducts.sort((a, b) => {
    const direction = params.sort?.endsWith("-desc") ? -1 : 1;
    const units = (product: ProductRecord) => (product.variants ?? []).filter((variant) => !variant.isArchived && variant.sellingStatus === "active").reduce((sum, variant) => sum + Math.max(0, variant.quantity), 0);
    if (params.sort?.startsWith("product-")) return direction * a.name.localeCompare(b.name);
    if (params.sort?.startsWith("category-")) return direction * (a.mainCategory ?? "").localeCompare(b.mainCategory ?? "");
    if (params.sort?.startsWith("price-")) return direction * (getProductPricePresentation(a).currentMin - getProductPricePresentation(b).currentMin);
    if (params.sort?.startsWith("inventory-")) return direction * (units(a) - units(b));
    if (params.sort?.startsWith("status-")) return direction * (a.status ?? "").localeCompare(b.status ?? "");
    return 0;
  });

  const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
  const brandValues = unique(allProducts.map((product) => product.brandSlug));
  const brandLabels = new Map(allProducts.map((product) => [product.brandSlug, product.brandName]));
  const categories = unique(allProducts.map((product) => product.mainCategory));
  const productTypes = unique(allProducts.map((product) => product.productTypeName));
  const collections = unique(allProducts.map((product) => product.collectionName));
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginatedProducts = filteredProducts.slice(pageStart, pageStart + PAGE_SIZE);
  const activeView = params.attention ? "attention" : params.status === "published" ? "published" : params.status === "paused" ? "paused" : params.status === "draft" ? "drafts" : params.status ? null : "all";

  return (
    <div className="mx-auto max-w-[1540px]">
      <DashboardPageHeader
        title="Products"
        description={`${allProducts.length} active catalog ${allProducts.length === 1 ? "product" : "products"} across ${brandValues.length} ${brandValues.length === 1 ? "brand" : "brands"}.`}
        actions={<><ProductCatalogTools archivedCount={archivedCount} /><Link href="/admin/products/new" className={`${dashboardButtonPrimary} active:scale-[0.98]`}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Add product</Link></>}
      />

      <ProductCatalogFilters
        action="/admin/products"
        clearHref="/admin/products"
        params={params}
        categories={categories}
        productTypes={productTypes}
        collections={collections}
        brands={brandValues.map((value) => ({ value, label: brandLabels.get(value) ?? value }))}
        showAdminFilters
        quickViews={<ProductQuickViews
          activeId={activeView}
          views={[
            { id: "all", label: "All products", href: "/admin/products", count: allProducts.length },
            { id: "published", label: "Published", href: "/admin/products?status=published", count: allProducts.filter((product) => product.status === "published").length },
            { id: "paused", label: "Paused", href: "/admin/products?status=paused", count: allProducts.filter((product) => product.status === "paused").length },
            { id: "drafts", label: "Drafts", href: "/admin/products?status=draft", count: allProducts.filter((product) => product.status === "draft").length },
            { id: "attention", label: "Needs attention", href: "/admin/products?attention=1", count: attentionProducts.length, attention: true },
          ]}
        />}
      />

      <BulkProductActions
        products={paginatedProducts}
        totalProducts={allProducts.length}
        clearHref="/admin/products"
        sort={params.sort}
        sortHrefs={{
          product: tableSortHref("/admin/products", params, "product"),
          category: tableSortHref("/admin/products", params, "category"),
          price: tableSortHref("/admin/products", params, "price"),
          inventory: tableSortHref("/admin/products", params, "inventory", "desc"),
          status: tableSortHref("/admin/products", params, "status"),
        }}
      />

      {totalPages > 1 ? (
        <nav aria-label="Product pages" className="mt-5 flex items-center justify-between gap-3">
          <PaginationLink href={buildPageHref(params, currentPage - 1)} disabled={currentPage === 1} label="Previous"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</PaginationLink>
          <p className="text-[12px] font-medium tabular-nums text-[#75685f]">Page {currentPage} of {totalPages}</p>
          <PaginationLink href={buildPageHref(params, currentPage + 1)} disabled={currentPage === totalPages} label="Next">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></PaginationLink>
        </nav>
      ) : null}
    </div>
  );
}

function buildPageHref(params: ProductSearchParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return `/admin/products${suffix ? `?${suffix}` : ""}`;
}

function PaginationLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const className = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[12.5px] font-semibold";
  return disabled
    ? <span aria-disabled="true" className={`${className} border-[#e8e0d7] bg-[#f7f3ee] text-[#b5aaa1]`}>{children}</span>
    : <Link href={href} aria-label={label} className={`${className} border-[#ddd6cd] bg-white text-[#51473f] hover:bg-[#f1eae2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25`}>{children}</Link>;
}
