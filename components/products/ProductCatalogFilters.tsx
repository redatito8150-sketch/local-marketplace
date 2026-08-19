import Link from "next/link";
import { ChevronDown, Filter, Search, SlidersHorizontal } from "lucide-react";

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
};

const controlClass = "h-11 min-w-0 rounded-xl border border-[#ddd6cd] bg-white px-3 text-[13px] text-[#51473f] outline-none transition-[border-color,box-shadow,background-color] duration-150 focus-visible:border-mahalyred/55 focus-visible:ring-4 focus-visible:ring-mahalyred/10";

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
}: ProductCatalogFiltersProps) {
  const advancedValues = [params.status, params.category, params.productType, params.collection, params.inventory];
  if (showAdminFilters) advancedValues.push(params.featured, params.minPrice, params.maxPrice);
  const uncommonQuickViewStatus = params.status && !["published", "draft"].includes(params.status);
  const advancedActive = Boolean(uncommonQuickViewStatus || params.category || params.productType || params.collection || params.inventory || (showAdminFilters && (params.featured || params.minPrice || params.maxPrice)));
  const activeCount = [params.q, ...advancedValues].filter(Boolean).length;

  return (
    <form action={action} className="mt-5 overflow-hidden rounded-[18px] border border-[#e5ddd5] bg-white shadow-[0_10px_30px_rgba(67,45,29,0.035)]">
      {preserveBrand && params.brand ? <input type="hidden" name="brand" value={params.brand} /> : null}
      {params.attention ? <input type="hidden" name="attention" value={params.attention} /> : null}
      <div className={`grid gap-2.5 p-3 ${showAdminFilters ? "sm:grid-cols-[minmax(240px,1fr)_minmax(150px,190px)_auto] lg:grid-cols-[minmax(280px,1fr)_minmax(150px,210px)_minmax(150px,190px)_auto]" : "sm:grid-cols-[minmax(240px,1fr)_minmax(150px,190px)_auto]"}`}>
        <label className="relative min-w-0">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9b8d82]" aria-hidden="true" />
          <input type="search" name="q" defaultValue={params.q ?? ""} placeholder={showAdminFilters ? "Search product, brand or SKU…" : "Search product or SKU…"} autoComplete="off" className={`${controlClass} w-full pl-10`} />
        </label>

        {showAdminFilters ? (
          <FilterField label="Brand" hideLabel>
            <select name="brand" defaultValue={params.brand ?? ""} className={`${controlClass} w-full`}>
              <option value="">All brands</option>
              {brands.map((brand) => <option key={brand.value} value={brand.value}>{brand.label}</option>)}
            </select>
          </FilterField>
        ) : null}

        <FilterField label="Sort by" hideLabel>
          <select name="sort" defaultValue={params.sort ?? ""} className={`${controlClass} w-full`}>
            <option value="">Newest first</option>
            <option value="name">Name A–Z</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </FilterField>

        <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-mahalyred px-5 text-[13px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-mahalyred-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mahalyred/20 active:scale-[0.98]">
          <Filter className="h-4 w-4" aria-hidden="true" /> Apply
        </button>
      </div>

      <details className="group border-t border-[#eee7de]" open={advancedActive || undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[12px] font-semibold text-[#75685f] transition-colors duration-150 hover:bg-[#fcfaf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mahalyred/25 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            More filters
            {advancedActive ? <span className="rounded-full bg-[#f1e3e1] px-2 py-0.5 text-[10.5px] text-mahalyred">Active</span> : null}
          </span>
          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="grid gap-3 border-t border-[#f1ebe5] bg-[#fcfaf8] p-4 sm:grid-cols-2 xl:grid-cols-4">
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
        </div>
      </details>

      {activeCount > 0 ? (
        <div className="flex min-h-11 items-center justify-between gap-3 border-t border-[#eee7de] px-4 py-2.5 text-[12px]">
          <span className="text-[#81746a]">{activeCount} active {activeCount === 1 ? "filter" : "filters"}</span>
          <Link href={clearHref} className="rounded-md font-semibold text-mahalyred underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">Clear all</Link>
        </div>
      ) : null}
    </form>
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
