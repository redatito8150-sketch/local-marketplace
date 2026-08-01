import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AllProductsShoppingArea from "@/components/category/AllProductsShoppingArea";
import { getMarketplaceCatalogFacets, getMarketplaceCatalogPage, type MarketplaceCatalogFilters } from "@/lib/data/products";
import { buildMarketplaceFilterGroups, derivePriceBounds, encodePriceRangeValue, parsePriceRangeValue } from "@/lib/filters";
import { isDiscountActive } from "@/lib/pricing";
import type { SortOption } from "@/types";
import { CATALOG_FILTER_QUERY_KEYS, parseCatalogFilterValues } from "@/lib/catalogQuery";

// Sitewide offers — a real destination in its own right (its own hero
// banner, live "up to X% off" stat), not a bare relabel of /shop/all —
// but reuses the exact same marketplace catalog + filter system underneath
// (full brand/price/size/etc. filtering stays available, per the owner:
// "so if someone's looking for something specific, they can still find
// it"), just with the existing "discounted" facet (lib/filters.ts) pinned
// on and hidden from the filter UI since it's implied by being on this page.
export const metadata: Metadata = { title: "Offers — Mahaly", description: "Every active discount across Mahaly's independent local brands, in one place." };
export const revalidate = 60;

const SORTS = new Set<SortOption>(["newest", "price-asc", "price-desc", "top-rated"]);

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function OffersPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await props.searchParams;
  const facets = await getMarketplaceCatalogFacets();
  const filterGroups = buildMarketplaceFilterGroups(facets).filter((group) => group.id !== "discounted");
  const allowed = new Map(filterGroups.map((group) => [group.id, new Set(group.options.map((option) => option.id))]));
  const priceBounds = derivePriceBounds(facets);
  const filters: MarketplaceCatalogFilters = { discounted: ["discounted-only"] };
  for (const key of CATALOG_FILTER_QUERY_KEYS) {
    if (key === "discounted") continue;
    if (key === "price") {
      const raw = parseCatalogFilterValues(params.price)[0];
      const range = raw ? parsePriceRangeValue(raw) : null;
      if (range) {
        const clamped = {
          min: Math.max(priceBounds.min, range.min),
          max: Math.min(priceBounds.max, range.max),
        };
        if (clamped.min <= clamped.max) filters.price = [encodePriceRangeValue(clamped.min, clamped.max)];
      }
      continue;
    }
    const selected = parseCatalogFilterValues(params[key]).filter((value) => allowed.get(key)?.has(value));
    if (selected.length) filters[key] = selected;
  }
  if (filters.mainCategory?.length && filters.productType?.length) {
    const supported = new Set(facets.filter((facet) => facet.mainCategory && filters.mainCategory?.includes(facet.mainCategory)).map((facet) => facet.productType).filter((type): type is string => Boolean(type)));
    filters.productType = filters.productType.filter((type) => supported.has(type));
    if (!filters.productType.length) delete filters.productType;
  }
  const rawSort = first(params.sort) as SortOption | undefined;
  const sort: SortOption = rawSort && SORTS.has(rawSort) ? rawSort : "newest";
  const search = (first(params.q) ?? "").trim().slice(0, 80);
  const requestedPage = Number(first(params.page));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  let result = await getMarketplaceCatalogPage({ search, sort, page, pageSize: 24, filters });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  if (page > totalPages) result = await getMarketplaceCatalogPage({ search, sort, page: totalPages, pageSize: 24, filters });

  const stateKey = JSON.stringify({ filters, sort, search, page: result.page });
  const maxDiscount = facets.reduce((max, facet) => {
    if (!isDiscountActive(facet.discountPercent, facet.discountEndsAt)) return max;
    return Math.max(max, Math.round(facet.discountPercent ?? 0));
  }, 0);

  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <div className="relative isolate overflow-hidden bg-[#16090d] px-4 py-14 text-white sm:px-6 sm:py-20 lg:px-10">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(153,42,60,.45),transparent_28%),radial-gradient(circle_at_10%_85%,rgba(196,144,77,.16),transparent_30%)]" />
        <div className="relative mx-auto max-w-brand">
          <p className="text-[11px] font-bold uppercase tracking-[.25em] text-[#e5bd78]">Sitewide</p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.05] sm:text-6xl">Current Offers</h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/65">Every active discount from Mahaly&apos;s independent local brands, in one place.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {maxDiscount > 0 && (
              <div className="inline-flex items-baseline gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 backdrop-blur">
                <span className="font-serif text-3xl text-[#f2cb83]">Up to {maxDiscount}%</span>
                <span className="text-[10px] uppercase tracking-widest text-white/50">off</span>
              </div>
            )}
            <div className="inline-flex items-baseline gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 backdrop-blur">
              <span className="font-serif text-3xl text-white">{result.total}</span>
              <span className="text-[10px] uppercase tracking-widest text-white/50">items on sale</span>
            </div>
          </div>
        </div>
      </div>
      <AllProductsShoppingArea
        key={stateKey}
        products={result.products}
        filterGroups={filterGroups}
        productTypeRelations={facets.map(({ mainCategory, productType }) => ({ mainCategory, productType }))}
        selected={filters as Record<string, string[]>}
        sort={sort}
        search={search}
        total={result.total}
        page={result.page}
        totalPages={totalPages}
        priceBounds={priceBounds}
      />
      <Footer />
    </main>
  );
}
