import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, PackageOpen, Plus } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getProductsForBrand, type BrandProductListItem } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import { listArchivedProducts } from "@/lib/admin/productDeletion";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import ProductRowActions from "@/components/brand-portal/ProductRowActions";
import ShowNowButton from "@/components/brand-portal/ShowNowButton";
import ProductCatalogFilters from "@/components/products/ProductCatalogFilters";
import ProductQuickViews from "@/components/products/ProductQuickViews";
import { canShowProductNow, ProductStatusBadges } from "@/components/products/ProductStatusBadges";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel, dashboardButtonPrimary } from "@/components/dashboard/DashboardUI";
import { needsBrandProductAttention } from "@/lib/brand-portal/productAttention";
import ProductPriceDisplay from "@/components/products/ProductPriceDisplay";
import { getProductPricePresentation } from "@/lib/products/pricingPresentation";
import SortableTableHeader, { tableSortHref } from "@/components/dashboard/SortableTableHeader";

const PAGE_SIZE = 25;
type ProductParams = {
  brand?: string;
  q?: string;
  status?: string;
  category?: string;
  productType?: string;
  collection?: string;
  inventory?: string;
  attention?: string;
  sort?: string;
  page?: string;
};

type DisplayProduct = BrandProductListItem & {
  editHref: string;
  inventoryHref: string;
  brandParam: string;
  // Show Now is an owner-only action (per the role model — an assistant
  // may pause/retire but not change launch policy), server-re-verified
  // regardless of this. Hidden here rather than shown-disabled/always-403:
  // an assistant or an admin viewing via impersonation (a read-only
  // safeguard — impersonation must never let an admin act as the brand)
  // never even sees the control.
  canShowNow: boolean;
};

export default async function BrandPortalProductsPage(props: { searchParams: Promise<ProductParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandId) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />;
  }

  // Archived products get their own database-paginated page. The main
  // list excludes them so permanent history never clutters active work.
  // A count-only page drives the Archived tab badge without loading rows.
  const [allProductsWithArchived, archivedCount] = await Promise.all([
    getProductsForBrand(owner.brandId, owner.isImpersonating),
    listArchivedProducts({ brandId: owner.brandId, limit: 1 }).then((page) => page.total).catch(() => 0),
  ]);
  const allProducts = allProductsWithArchived.filter((product) => product.status !== "archived");
  const attentionProducts = allProducts.filter(needsBrandProductAttention);
  const query = params.q?.trim().toLowerCase();
  const filteredProducts = allProducts.filter((product) => {
    if (query && !`${product.name} ${product.sku} ${product.variantSkus.join(" ")}`.toLowerCase().includes(query)) return false;
    if (params.status && product.status !== params.status) return false;
    if (params.category && product.mainCategory !== params.category) return false;
    if (params.productType && product.productType !== params.productType) return false;
    if (params.collection && product.collection !== params.collection) return false;
    if (params.inventory === "in" && !product.inStock) return false;
    if (params.inventory === "out" && product.inStock) return false;
    if (params.attention && !needsBrandProductAttention(product)) return false;
    return true;
  });
  filteredProducts.sort((a, b) => {
    const direction = params.sort?.endsWith("-desc") ? -1 : 1;
    if (params.sort?.startsWith("product-")) return direction * a.name.localeCompare(b.name);
    if (params.sort?.startsWith("category-")) return direction * (a.mainCategory ?? "").localeCompare(b.mainCategory ?? "");
    if (params.sort?.startsWith("price-")) return direction * (getProductPricePresentation(a).currentMin - getProductPricePresentation(b).currentMin);
    if (params.sort?.startsWith("inventory-")) return direction * (a.stockUnits - b.stockUnits);
    if (params.sort?.startsWith("status-")) return direction * a.status.localeCompare(b.status);
    if (params.attention) return attentionPriority(a) - attentionPriority(b) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
  const categories = unique(allProducts.map((product) => product.mainCategory));
  const productTypes = unique(allProducts.map((product) => product.productType));
  const collections = unique(allProducts.map((product) => product.collection));
  const activeCount = [params.q, params.status, params.category, params.productType, params.collection, params.inventory, params.attention].filter(Boolean).length;
  const brandParam = owner.isImpersonating ? `?brand=${owner.brandSlug}` : "";
  const viewBaseParams = owner.isImpersonating && owner.brandSlug ? { brand: owner.brandSlug } : {};
  const activeView = params.attention
    ? "attention"
    : params.status === "published"
      ? "published"
      : params.status === "draft"
        ? "drafts"
        : params.status
          ? null
          : "all";
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginatedProducts = filteredProducts.slice(pageStart, pageStart + PAGE_SIZE);
  const canShowNow = owner.accessLevel === "owner" && !owner.isImpersonating;
  const displayProducts: DisplayProduct[] = paginatedProducts.map((product) => ({
    ...product,
    editHref: `/brand-portal/products/${product.id}/edit${brandParam}`,
    inventoryHref: buildInventoryHref(product, owner.isImpersonating ? owner.brandSlug ?? undefined : undefined),
    brandParam,
    canShowNow,
  }));

  return (
    <div className="mx-auto max-w-[1540px]">
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader
        eyebrow="Catalog"
        title="Products"
        description={`${allProducts.length} ${allProducts.length === 1 ? "product" : "products"} in your catalog. Manage availability, pricing, and publishing from one place.`}
        actions={<Link href={`/brand-portal/products/new${brandParam}`} className={`${dashboardButtonPrimary} active:translate-y-px`}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Add product</Link>}
      />

      <ProductCatalogFilters
        action="/brand-portal/products"
        params={{ ...params, brand: owner.isImpersonating ? owner.brandSlug ?? undefined : undefined }}
        clearHref={`/brand-portal/products${brandParam}`}
        categories={categories}
        productTypes={productTypes}
        collections={collections}
        preserveBrand
        quickViews={<ProductQuickViews
          activeId={activeView}
          views={[
            { id: "all", label: "All products", href: buildQuickViewHref("/brand-portal/products", viewBaseParams), count: allProducts.length },
            { id: "published", label: "Published", href: buildQuickViewHref("/brand-portal/products", viewBaseParams, { status: "published" }), count: allProducts.filter((product) => product.status === "published").length },
            { id: "drafts", label: "Drafts", href: buildQuickViewHref("/brand-portal/products", viewBaseParams, { status: "draft" }), count: allProducts.filter((product) => product.status === "draft").length },
            { id: "attention", label: "Needs attention", href: buildQuickViewHref("/brand-portal/products", viewBaseParams, { attention: "1" }), count: attentionProducts.length, attention: true },
          ]}
          archived={{ href: buildQuickViewHref("/brand-portal/products/archived", viewBaseParams), count: archivedCount }}
        />}
      />

      <DashboardPanel className="mt-3 border-[#e3dcd3] bg-[#fffdf9] shadow-[0_10px_30px_rgba(67,45,29,0.04)]">
        {displayProducts.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[960px] text-left text-[13px]">
                <thead className="border-b border-[#e8e0d7] bg-[#fbf8f4] text-[10.5px] uppercase tracking-[0.08em] text-[#897b70]">
                  <tr>
                    <SortableTableHeader label="Product" href={tableSortHref("/brand-portal/products", params, "product")} active={params.sort?.startsWith("product-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} />
                    <SortableTableHeader label="Category" href={tableSortHref("/brand-portal/products", params, "category")} active={params.sort?.startsWith("category-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} />
                    <SortableTableHeader label="Price" href={tableSortHref("/brand-portal/products", params, "price")} active={params.sort?.startsWith("price-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} />
                    <SortableTableHeader label="Inventory" href={tableSortHref("/brand-portal/products", params, "inventory", "desc")} active={params.sort?.startsWith("inventory-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} />
                    <SortableTableHeader label="Status" href={tableSortHref("/brand-portal/products", params, "status")} active={params.sort?.startsWith("status-")} direction={params.sort?.endsWith("desc") ? "desc" : "asc"} />
                    <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eee7de]">
                  {displayProducts.map((product) => <ProductTableRow key={product.id} product={product} />)}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-[#eee7de] lg:hidden">
              {displayProducts.map((product) => <ProductMobileCard key={product.id} product={product} />)}
            </div>
          </>
        ) : (
          <DashboardEmptyState
            title="No matching products"
            description={activeCount ? "Clear or adjust the filters to see more products." : "Add your first product to start building the catalog."}
            action={activeCount
              ? <Link href={`/brand-portal/products${brandParam}`} className="text-[12.5px] font-semibold text-mahalyred hover:underline">Clear filters</Link>
              : <Link href={`/brand-portal/products/new${brandParam}`} className={dashboardButtonPrimary}>Add product</Link>}
          />
        )}
      </DashboardPanel>

      {totalPages > 1 && (
        <nav aria-label="Product pages" className="mt-5 flex items-center justify-between gap-3">
          <PaginationLink href={buildPageHref(params, currentPage - 1)} disabled={currentPage === 1} label="Previous"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</PaginationLink>
          <p className="text-[12px] font-medium tabular-nums text-[#75685f]">Page {currentPage} of {totalPages}</p>
          <PaginationLink href={buildPageHref(params, currentPage + 1)} disabled={currentPage === totalPages} label="Next">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></PaginationLink>
        </nav>
      )}
    </div>
  );
}

function ProductTableRow({ product }: { product: DisplayProduct }) {
  return (
    <tr className="transition-colors hover:bg-[#fbf8f4]">
      <td className="px-5 py-4">
        <Link href={product.editHref} className="group flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">
          <ProductImage product={product} className="h-16 w-14" />
          <div className="min-w-0">
            <p className="max-w-[260px] truncate font-bold text-[#242424] group-hover:text-mahalyred">{product.name}</p>
            <p className="mt-1 truncate text-[10.5px] text-[#8a7d73]">{product.sku}</p>
            <p className="mt-1 truncate text-[10.5px] text-[#9b8e84]">{product.collection ?? "No collection"} · {formatUpdatedAt(product.updatedAt)}</p>
          </div>
        </Link>
      </td>
      <td className="px-5 py-4 text-[#75685f]"><p>{product.mainCategory ?? "Not assigned"}</p>{product.productType && <p className="mt-1 text-[11px] text-[#9b8e84]">{product.productType}</p>}</td>
      <td className="px-5 py-4"><ProductPriceDisplay product={product} /></td>
      <td className="px-5 py-4"><InventorySummary product={product} /></td>
      <td className="px-5 py-4"><ProductStatuses product={product} /></td>
      <td className="px-5 py-4"><ProductRowActions productId={product.id} name={product.name} editHref={product.editHref} status={product.status} pausedByBrand={product.pausedByBrand} /></td>
    </tr>
  );
}

function ProductMobileCard({ product }: { product: DisplayProduct }) {
  return (
    <article className="p-4 sm:p-5">
      <div className="flex min-w-0 gap-4">
        <Link href={product.editHref} className="flex-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"><ProductImage product={product} className="h-24 w-20" /></Link>
        <div className="min-w-0 flex-1">
          <Link href={product.editHref} className="block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25"><h2 className="truncate text-[15px] font-bold text-[#242424] hover:text-mahalyred">{product.name}</h2></Link>
          <p className="mt-1 truncate text-[10.5px] text-[#8a7d73]">{product.sku}</p>
          <p className="mt-1 text-[12px] text-[#81746a]">{[product.mainCategory, product.productType].filter(Boolean).join(" / ") || "Category not assigned"}</p>
          <p className="mt-1 text-[10.5px] text-[#a29489]">{formatUpdatedAt(product.updatedAt)}</p>
          <div className="mt-2"><ProductPriceDisplay product={product} compact /></div>
          <div className="mt-3 flex flex-wrap gap-1.5"><ProductStatuses product={product} /></div>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-[#eee7de] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <InventorySummary product={product} />
        <ProductRowActions productId={product.id} name={product.name} editHref={product.editHref} status={product.status} pausedByBrand={product.pausedByBrand} />
      </div>
    </article>
  );
}

function ProductImage({ product, className }: { product: DisplayProduct; className: string }) {
  return (
    <span className={`relative block flex-none overflow-hidden rounded-xl bg-[#f1eae2] ${className}`}>
      {product.image
        ? <Image src={product.image} alt={product.name} fill sizes="96px" className="object-cover" />
        : <span className="flex h-full w-full items-center justify-center text-[#a29489]"><PackageOpen className="h-5 w-5" aria-hidden="true" /></span>}
    </span>
  );
}

function InventorySummary({ product }: { product: DisplayProduct }) {
  const status = product.stockStatus === "out_of_stock"
    ? { label: "Out of stock", className: "text-red-700", dotClassName: "bg-red-500" }
    : product.stockStatus === "low_stock"
      ? { label: "Low stock", className: "text-amber-700", dotClassName: "bg-amber-500" }
      : { label: "In stock", className: "text-emerald-700", dotClassName: "bg-emerald-500" };
  const restockDetail = `${product.stockIssueCount} ${product.stockIssueCount === 1 ? "variant needs" : "variants need"} restock`;
  return (
    <div>
      {product.stockStatus === "in_stock" ? (
        <p className={`inline-flex items-center gap-1.5 text-[12.5px] font-bold ${status.className}`}><span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} aria-hidden="true" />{status.label}</p>
      ) : (
        <Link href={product.inventoryHref} title={`Open ${product.name} inventory`} className={`inline-flex items-center gap-1.5 rounded-sm text-[12.5px] font-bold underline decoration-current/30 underline-offset-2 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 ${status.className}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dotClassName}`} aria-hidden="true" />{status.label}
        </Link>
      )}
      {product.stockStatus === "low_stock" ? (
        <div className="mt-1 text-[11px] tabular-nums text-[#9b8e84]">
          <p>{restockDetail}</p>
          <p>· {product.stockUnits} units total</p>
        </div>
      ) : (
        <p className="mt-1 text-[11px] tabular-nums text-[#9b8e84]">{product.stockUnits} units · {product.variantCount} {product.variantCount === 1 ? "variant" : "variants"}</p>
      )}
    </div>
  );
}

function ProductStatuses({ product }: { product: DisplayProduct }) {
  return (
    <ProductStatusBadges
      product={product}
      showReviewNotes
      action={canShowProductNow(product) && product.canShowNow ? <ShowNowButton productId={product.id} brandParam={product.brandParam} /> : null}
    />
  );
}

function attentionPriority(product: BrandProductListItem) {
  if (product.status === "changes_requested") return 0;
  if (product.stockStatus === "out_of_stock") return 1;
  if (product.stockStatus === "low_stock") return 2;
  return 3;
}

function buildInventoryHref(product: BrandProductListItem, brand?: string) {
  const query = new URLSearchParams({
    product: product.id,
    level: product.stockStatus === "out_of_stock" ? "out" : "low",
  });
  if (brand) query.set("brand", brand);
  return `/brand-portal/stock?${query}`;
}

function formatUpdatedAt(value: string) {
  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) return "Update date unavailable";
  const days = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 86_400_000));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days} days ago`;
  return `Updated ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: updatedAt.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(updatedAt)}`;
}

function buildQuickViewHref(basePath: string, brandParams: { brand?: string }, values: Record<string, string> = {}) {
  const query = new URLSearchParams();
  if (brandParams.brand) query.set("brand", brandParams.brand);
  for (const [key, value] of Object.entries(values)) query.set(key, value);
  return `${basePath}${query.size ? `?${query}` : ""}`;
}

function buildPageHref(params: ProductParams, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const suffix = query.toString();
  return `/brand-portal/products${suffix ? `?${suffix}` : ""}`;
}

function PaginationLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const className = "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[12.5px] font-semibold";
  return disabled
    ? <span aria-disabled="true" className={`${className} border-[#e8e0d7] bg-[#f7f3ee] text-[#b5aaa1]`}>{children ?? label}</span>
    : <Link href={href} aria-label={label} className={`${className} border-[#ddd6cd] bg-[#fffdf9] text-[#51473f] hover:bg-[#f1eae2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25`}>{children ?? label}</Link>;
}
