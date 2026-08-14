import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, ChevronLeft, ChevronRight, PackageOpen, Plus, Star } from "lucide-react";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { getProductsForBrand, type BrandProductListItem } from "@/lib/data/brandPortal";
import { getAllBrandsForAdmin } from "@/lib/data/admin";
import { draftDaysRemaining } from "@/lib/admin/expireDrafts";
import { isPublishDateLive } from "@/lib/newArrivals";
import { formatPrice } from "@/lib/format";
import BrandPicker from "@/components/brand-portal/BrandPicker";
import AdminViewingBanner from "@/components/brand-portal/AdminViewingBanner";
import ProductFilters from "@/components/brand-portal/ProductFilters";
import ProductRowActions from "@/components/brand-portal/ProductRowActions";
import { DashboardEmptyState, DashboardPageHeader, DashboardPanel, dashboardButtonPrimary } from "@/components/dashboard/DashboardUI";
import { needsBrandProductAttention } from "@/lib/brand-portal/productAttention";

const PAGE_SIZE = 25;
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-[#eee9e4] text-[#6f6259]" },
  pending_review: { label: "Pending Review", className: "bg-amber-50 text-amber-700" },
  changes_requested: { label: "Changes Requested", className: "bg-red-50 text-red-700" },
  published: { label: "Published", className: "bg-emerald-50 text-emerald-700" },
  archived: { label: "Archived", className: "bg-[#eee9e4] text-[#6f6259]" },
};

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
  statusInfo: { label: string; className: string };
  editHref: string;
  inventoryHref: string;
};

export default async function BrandPortalProductsPage(props: { searchParams: Promise<ProductParams> }) {
  const params = await props.searchParams;
  const owner = await requireBrandOwner(params.brand);
  if (!owner) redirect("/account");
  if (!owner.brandId) {
    const brands = await getAllBrandsForAdmin();
    return <BrandPicker brands={brands.map((brand) => ({ slug: brand.slug, name: brand.name }))} />;
  }

  const allProducts = await getProductsForBrand(owner.brandId, owner.isImpersonating);
  const attentionProducts = allProducts.filter(needsBrandProductAttention);
  const query = params.q?.trim().toLowerCase();
  const filteredProducts = allProducts.filter((product) => {
    if (query && !product.name.toLowerCase().includes(query)) return false;
    if (params.status && product.status !== params.status) return false;
    if (params.category && product.mainCategory !== params.category) return false;
    if (params.productType && product.productType !== params.productType) return false;
    if (params.collection && product.collection !== params.collection) return false;
    if (params.inventory === "in" && !product.inStock) return false;
    if (params.inventory === "out" && product.inStock) return false;
    if (params.attention && !needsBrandProductAttention(product)) return false;
    return true;
  });
  filteredProducts.sort((a, b) => params.attention
    ? attentionPriority(a) - attentionPriority(b) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    : params.sort === "name"
      ? a.name.localeCompare(b.name)
      : params.sort === "price-asc"
        ? a.price - b.price
        : params.sort === "price-desc"
          ? b.price - a.price
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
        : params.status === "archived"
          ? "archived"
        : params.status
          ? null
          : "all";
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginatedProducts = filteredProducts.slice(pageStart, pageStart + PAGE_SIZE);
  const displayProducts: DisplayProduct[] = paginatedProducts.map((product) => ({
    ...product,
    statusInfo: getStatusInfo(product),
    editHref: `/brand-portal/products/${product.id}/edit${brandParam}`,
    inventoryHref: buildInventoryHref(product, owner.isImpersonating ? owner.brandSlug ?? undefined : undefined),
  }));
  const firstResult = filteredProducts.length ? pageStart + 1 : 0;
  const lastResult = Math.min(pageStart + PAGE_SIZE, filteredProducts.length);

  return (
    <div className="mx-auto max-w-[1540px]">
      {owner.isImpersonating && <AdminViewingBanner brandName={owner.brandName!} />}
      <DashboardPageHeader
        eyebrow="Catalog"
        title="Products"
        description={`${allProducts.length} ${allProducts.length === 1 ? "product" : "products"} in your catalog. Manage availability, pricing, and publishing from one place.`}
        actions={<Link href={`/brand-portal/products/new${brandParam}`} className={`${dashboardButtonPrimary} active:translate-y-px`}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Add product</Link>}
      />

      <QuickViews
        activeView={activeView}
        brandParams={viewBaseParams}
        counts={{
          all: allProducts.length,
          published: allProducts.filter((product) => product.status === "published").length,
          drafts: allProducts.filter((product) => product.status === "draft").length,
          archived: allProducts.filter((product) => product.status === "archived").length,
          attention: attentionProducts.length,
        }}
      />

      <ProductFilters
        params={{ ...params, brand: owner.isImpersonating ? owner.brandSlug ?? undefined : undefined }}
        clearHref={`/brand-portal/products${brandParam}`}
        categories={categories}
        productTypes={productTypes}
        collections={collections}
      />

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] font-semibold tabular-nums text-[#51473f]">
          {filteredProducts.length === allProducts.length
            ? `${allProducts.length} catalog ${allProducts.length === 1 ? "product" : "products"}`
            : `${filteredProducts.length} of ${allProducts.length} products`}
        </p>
        {filteredProducts.length > 0 && <p className="text-[12px] tabular-nums text-[#81746a]">Showing {firstResult}-{lastResult}</p>}
      </div>

      <DashboardPanel className="mt-3 border-[#e3dcd3] bg-[#fffdf9] shadow-[0_10px_30px_rgba(67,45,29,0.04)]">
        {displayProducts.length ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[960px] text-left text-[13px]">
                <thead className="border-b border-[#e8e0d7] bg-[#fbf8f4] text-[10.5px] uppercase tracking-[0.08em] text-[#897b70]">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Product</th>
                    <th className="px-5 py-3 font-semibold">Category</th>
                    <th className="px-5 py-3 font-semibold">Price</th>
                    <th className="px-5 py-3 font-semibold">Inventory</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
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
            <p className="mt-1 truncate text-[11.5px] text-[#8a7d73]">{product.collection ?? "No collection"}</p>
            <p className="mt-1 text-[10.5px] text-[#a29489]">{formatUpdatedAt(product.updatedAt)}</p>
          </div>
        </Link>
      </td>
      <td className="px-5 py-4 text-[#75685f]"><p>{product.mainCategory ?? "Not assigned"}</p>{product.productType && <p className="mt-1 text-[11px] text-[#9b8e84]">{product.productType}</p>}</td>
      <td className="px-5 py-4 font-bold tabular-nums text-[#242424]">{formatPrice(product.price, product.currency)}</td>
      <td className="px-5 py-4"><InventorySummary product={product} /></td>
      <td className="px-5 py-4"><ProductStatuses product={product} /></td>
      <td className="px-5 py-4"><ProductRowActions productId={product.id} name={product.name} editHref={product.editHref} canArchive={product.status === "published"} deletionRequested={Boolean(product.deletionRequestedAt)} /></td>
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
          <p className="mt-1 text-[12px] text-[#81746a]">{[product.mainCategory, product.productType].filter(Boolean).join(" / ") || "Category not assigned"}</p>
          <p className="mt-1 text-[10.5px] text-[#a29489]">{formatUpdatedAt(product.updatedAt)}</p>
          <p className="mt-2 text-[14px] font-bold tabular-nums text-[#242424]">{formatPrice(product.price, product.currency)}</p>
          <div className="mt-3 flex flex-wrap gap-1.5"><ProductStatuses product={product} /></div>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 border-t border-[#eee7de] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <InventorySummary product={product} />
        <ProductRowActions productId={product.id} name={product.name} editHref={product.editHref} canArchive={product.status === "published"} deletionRequested={Boolean(product.deletionRequestedAt)} />
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

function QuickViews({
  activeView,
  brandParams,
  counts,
}: {
  activeView: "all" | "published" | "drafts" | "archived" | "attention" | null;
  brandParams: { brand?: string };
  counts: Record<"all" | "published" | "drafts" | "archived" | "attention", number>;
}) {
  const views = [
    { id: "all" as const, label: "All products", params: {} },
    { id: "published" as const, label: "Published", params: { status: "published" } },
    { id: "drafts" as const, label: "Drafts", params: { status: "draft" } },
    { id: "archived" as const, label: "Archived", params: { status: "archived" } },
    { id: "attention" as const, label: "Needs attention", params: { attention: "1" } },
  ];
  return (
    <nav aria-label="Product quick views" className="mt-6 flex gap-2 overflow-x-auto pb-1">
      {views.map((view) => {
        const selected = activeView === view.id;
        const query = new URLSearchParams();
        if (brandParams.brand) query.set("brand", brandParams.brand);
        for (const [key, value] of Object.entries(view.params)) query.set(key, value);
        const href = `/brand-portal/products${query.size ? `?${query}` : ""}`;
        const attention = view.id === "attention";
        return (
          <Link
            key={view.id}
            href={href}
            aria-current={selected ? "page" : undefined}
            className={`inline-flex h-10 flex-none items-center gap-2 rounded-xl border px-3.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 ${selected
              ? "border-mahalyred bg-mahalyred text-white"
              : attention && counts.attention > 0
                ? "border-[#edcbc7] bg-[#fff7f5] text-mahalyred hover:bg-[#f8e9e7]"
                : "border-[#e3dcd3] bg-[#fffdf9] text-[#62564d] hover:bg-[#f7f2ec]"}`}
          >
            {attention && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
            {view.label}
            <span className={`min-w-5 rounded-md px-1.5 py-0.5 text-center text-[10.5px] tabular-nums ${selected ? "bg-white/20 text-white" : "bg-[#eee7df] text-[#75685f]"}`}>{counts[view.id]}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ProductStatuses({ product }: { product: DisplayProduct }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`rounded-lg px-2.5 py-1 text-[10.5px] font-bold ${product.statusInfo.className}`}>{product.statusInfo.label}</span>
      {product.featured && (
        <span title="Selected by the marketplace team" className="inline-flex items-center gap-1 rounded-lg bg-[#f8e9e7] px-2.5 py-1 text-[10.5px] font-bold text-mahalyred">
          <Star className="h-3 w-3" fill="currentColor" aria-hidden="true" /> Featured
        </span>
      )}
      {product.hasPendingEdit && <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-[10.5px] font-bold text-amber-700">Edit pending</span>}
      {product.pausedByBrand && <span className="rounded-lg bg-[#eee9e4] px-2.5 py-1 text-[10.5px] font-bold text-[#6f6259]">Paused</span>}
      {product.deletionRequestedAt && <span className="rounded-lg bg-red-50 px-2.5 py-1 text-[10.5px] font-bold text-red-700">Deletion requested</span>}
      {product.reviewNotes && <p className="w-full max-w-xs pt-1 text-[11px] leading-4 text-red-700">{product.reviewNotes}</p>}
    </div>
  );
}

function getStatusInfo(product: BrandProductListItem) {
  const baseStatusInfo = STATUS_LABELS[product.status] ?? { label: product.status, className: "bg-[#eee9e4] text-[#6f6259]" };
  const daysLeft = product.status === "draft" ? draftDaysRemaining(product.draftStartedAt) : null;
  const isScheduled = product.status === "published" && !isPublishDateLive(product.publishDate ?? null);
  if (daysLeft != null) return { label: `Draft: ${Math.max(daysLeft, 0)}d left`, className: daysLeft <= 3 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800" };
  if (isScheduled) return { label: `Scheduled: ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(product.publishDate!))}`, className: "bg-[#eef3f5] text-[#4e6876]" };
  return baseStatusInfo;
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
