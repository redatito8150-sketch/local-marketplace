import Link from "next/link";
import { ChevronDown, Filter, Search, SlidersHorizontal } from "lucide-react";

type FilterParams = {
  brand?: string;
  q?: string;
  status?: string;
  category?: string;
  productType?: string;
  collection?: string;
  inventory?: string;
  attention?: string;
  sort?: string;
};

const controlClass =
  "h-11 min-w-0 rounded-xl border border-[#ddd6cd] bg-white px-3 text-[13px] text-[#51473f] outline-none transition-colors focus:border-mahalyred/50 focus:ring-2 focus:ring-mahalyred/10";

export default function ProductFilters({
  params,
  clearHref,
  categories,
  productTypes,
  collections,
}: {
  params: FilterParams;
  clearHref: string;
  categories: string[];
  productTypes: string[];
  collections: string[];
}) {
  const advancedActive = Boolean(params.productType || params.collection || params.inventory);
  const activeCount = [params.q, params.status, params.category, params.productType, params.collection, params.inventory]
    .filter(Boolean).length;

  return (
    <form action="/brand-portal/products" className="mt-6 rounded-2xl border border-[#e3dcd3] bg-[#fffdf9] p-4 shadow-[0_10px_30px_rgba(67,45,29,0.04)] sm:p-5">
      {params.brand && <input type="hidden" name="brand" value={params.brand} />}
      {params.attention && <input type="hidden" name="attention" value={params.attention} />}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1.5 block text-[11px] font-bold text-[#81746a]">Search products</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#a29489]" aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search by product name…"
              autoComplete="off"
              className={`${controlClass} w-full pl-10 xl:min-w-[280px]`}
            />
          </span>
        </label>
        <FilterField label="Status">
          <select name="status" defaultValue={params.status ?? ""} className={`${controlClass} w-full xl:min-w-[170px]`}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_review">Pending Review</option>
            <option value="changes_requested">Changes Requested</option>
            <option value="published">Published</option>
            <option value="archived">Archived</option>
          </select>
        </FilterField>
        <FilterField label="Category">
          <select name="category" defaultValue={params.category ?? ""} className={`${controlClass} w-full xl:min-w-[170px]`}>
            <option value="">All categories</option>
            {categories.map((value) => <option key={value}>{value}</option>)}
          </select>
        </FilterField>
        <FilterField label="Sort by">
          <select name="sort" defaultValue={params.sort ?? ""} className={`${controlClass} w-full xl:min-w-[170px]`}>
            <option value="">Newest first</option>
            <option value="name">Name A-Z</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </FilterField>
        <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-mahalyred px-5 text-[13px] font-semibold text-white transition-colors hover:bg-mahalyred-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/30 active:translate-y-px">
          <Filter className="h-4 w-4" aria-hidden="true" /> Apply
        </button>
      </div>

      <details className="group mt-4 border-t border-[#eee7de] pt-4" open={advancedActive || undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12.5px] font-semibold text-[#75685f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            More filters
            {advancedActive && <span className="rounded-full bg-[#f1e3e1] px-2 py-0.5 text-[10.5px] text-mahalyred">Active</span>}
          </span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
        </div>
      </details>

      {activeCount > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#eee7de] pt-4 text-[12px]">
          <span className="text-[#81746a]">{activeCount} active {activeCount === 1 ? "filter" : "filters"}</span>
          <Link href={clearHref} className="font-semibold text-mahalyred hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mahalyred/25">Clear all</Link>
        </div>
      )}
    </form>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="min-w-0">
      <span className="mb-1.5 block text-[11px] font-bold text-[#81746a]">{label}</span>
      {children}
    </label>
  );
}
