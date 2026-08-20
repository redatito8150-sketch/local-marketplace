import Link from "next/link";
import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import AutoSubmitForm from "@/components/dashboard/AutoSubmitForm";
import { DashboardMoreFilters } from "@/components/dashboard/DashboardFilters";

export type ProductCatalogFilterParams = {
  brand?: string;
  q?: string;
  status?: string;
  category?: string;
  productType?: string;
  collection?: string;
  inventory?: string;
  attention?: string;
  featured?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
};

type ProductCatalogFiltersProps = {
  action: string;
  clearHref: string;
  params: ProductCatalogFilterParams;
  categories: string[];
  productTypes: string[];
  collections: string[];
  brands?: Array<{ value: string; label: string }>;
  showAdminFilters?: boolean;
  preserveBrand?: boolean;
  quickViews?: ReactNode;
};

const controlClass = "h-10 min-w-0 rounded-xl border border-[#e5ddd5] bg-[#fcfaf8] px-3 text-[11.5px] font-semibold text-[#51473f] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:font-normal placeholder:text-[#9b8d82] hover:border-[#d8ccc3] focus:border-[#C85956]/45 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#C85956]/8 focus-visible:border-[#C85956]/45 focus-visible:ring-4 focus-visible:ring-[#C85956]/8";

export default function ProductCatalogFilters({
  action,
  clearHref,
  params,
  categories,
  productTypes,
  collections,
  brands = [],
  showAdminFilters = false,
  preserveBrand = false,
  quickViews,
}: ProductCatalogFiltersProps) {
  const advancedValues = [params.status, params.category, params.productType, params.collection, params.inventory];
  if (showAdminFilters) advancedValues.push(params.featured, params.minPrice, params.maxPrice);
  const uncommonQuickViewStatus = params.status && !["published", "paused", "draft"].includes(params.status);
  const advancedActive = Boolean(uncommonQuickViewStatus || params.category || params.productType || params.collection || params.inventory || (showAdminFilters && (params.brand || params.featured || params.minPrice || params.maxPrice)));
  const activeCount = [params.q, showAdminFilters ? params.brand : undefined, params.attention, ...advancedValues].filter(Boolean).length;

  return (
    <AutoSubmitForm action={action} className="relative mt-4">
      {preserveBrand && params.brand ? <input type="hidden" name="brand" value={params.brand} /> : null}
      {params.attention ? <input type="hidden" name="attention" value={params.attention} /> : null}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="relative order-[1] min-w-0 sm:w-[320px] sm:flex-none">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b8d82]" aria-hidden="true" />
          <input type="search" name="q" defaultValue={params.q ?? ""} placeholder={showAdminFilters ? "Search product, brand or SKU…" : "Search product or SKU…"} autoComplete="off" className={`${controlClass} w-full pl-10`} />
        </label>

        {quickViews}

        {activeCount > 0 ? <Link href={clearHref} aria-label={`Clear ${activeCount} active product filters`} className="order-[5] inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[10.5px] font-bold text-[#75685f] transition-colors hover:bg-[#f7f1ec] hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25"><X className="h-3.5 w-3.5" aria-hidden="true" />Clear</Link> : null}
        <DashboardMoreFilters label="More product filters" active={advancedActive} className="[&>div]:lg:grid-cols-4 [&>div]:lg:w-[min(92vw,720px)]">
          {showAdminFilters ? (
            <FilterField label="Brand">
              <select name="brand" defaultValue={params.brand ?? ""} className={`${controlClass} w-full`}>
                <option value="">All brands</option>
                {brands.map((brand) => <option key={brand.value} value={brand.value}>{brand.label}</option>)}
              </select>
            </FilterField>
          ) : null}
          <FilterField label="Status">
            <select name="status" defaultValue={params.status ?? ""} className={`${controlClass} w-full`}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="pending_review">Pending Review</option>
              <option value="changes_requested">Changes Requested</option>
              <option value="published">Published</option>
            </select>
          </FilterField>
          <FilterField label="Category">
            <select name="category" defaultValue={params.category ?? ""} className={`${controlClass} w-full`}>
              <option value="">All categories</option>
              {categories.map((value) => <option key={value}>{value}</option>)}
            </select>
          </FilterField>
          <FilterField label="Product type">
            <select name="productType" defaultValue={params.productType ?? ""} className={`${controlClass} w-full`}>
              <option value="">All types</option>
              {productTypes.map((value) => <option key={value}>{value}</option>)}
            </select>
          </FilterField>
          <FilterField label="Collection">
            <select name="collection" defaultValue={params.collection ?? ""} className={`${controlClass} w-full`}>
              <option value="">All collections</option>
              {collections.map((value) => <option key={value}>{value}</option>)}
            </select>
          </FilterField>
          <FilterField label="Inventory">
            <select name="inventory" defaultValue={params.inventory ?? ""} className={`${controlClass} w-full`}>
              <option value="">Any stock</option>
              <option value="in">In stock</option>
              <option value="out">Out of stock</option>
            </select>
          </FilterField>
          {showAdminFilters ? (
            <>
              <FilterField label="Featured">
                <select name="featured" defaultValue={params.featured ?? ""} className={`${controlClass} w-full`}>
                  <option value="">Any placement</option>
                  <option value="yes">Featured</option>
                  <option value="no">Not featured</option>
                </select>
              </FilterField>
              <FilterField label="Minimum price">
                <input name="minPrice" type="number" inputMode="decimal" min="0" defaultValue={params.minPrice ?? ""} placeholder="EGP 0" autoComplete="off" className={`${controlClass} w-full`} />
              </FilterField>
              <FilterField label="Maximum price">
                <input name="maxPrice" type="number" inputMode="decimal" min="0" defaultValue={params.maxPrice ?? ""} placeholder="Any price" autoComplete="off" className={`${controlClass} w-full`} />
              </FilterField>
            </>
          ) : null}
        </DashboardMoreFilters>
      </div>
    </AutoSubmitForm>
  );
}

function FilterField({ label, hideLabel = false, children }: { label: string; hideLabel?: boolean; children: React.ReactNode }) {
  return (
    <label className="min-w-0">
      <span className={hideLabel ? "sr-only" : "mb-1.5 block text-[11px] font-bold text-[#81746a]"}>{label}</span>
      {children}
    </label>
  );
}
