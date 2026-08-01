import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AllProductsShoppingArea from "@/components/category/AllProductsShoppingArea";
import { getMarketplaceCatalogFacets, getMarketplaceCatalogPage, type MarketplaceCatalogFilters } from "@/lib/data/products";
import { buildMarketplaceFilterGroups, derivePriceBounds, encodePriceRangeValue, parsePriceRangeValue } from "@/lib/filters";
import type { SortOption } from "@/types";
import { CATALOG_FILTER_QUERY_KEYS, parseCatalogFilterValues } from "@/lib/catalogQuery";

// Sitewide offers — replaces the old per-brand /brands/[slug]/offers page.
// Reuses the exact same marketplace catalog + filter system as /shop/all
// (not a bespoke listing), just with the existing "discounted" facet
// (lib/filters.ts) pinned on and hidden from the filter UI since it's
// implied by being on this page.
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
  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <div className="mx-auto max-w-brand px-4 pt-8 sm:px-6 lg:px-10">
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-mahalyred">Sitewide</p>
        <h1 className="mt-2 font-serif text-3xl text-ink sm:text-4xl">Offers</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">Every active discount from Mahaly&apos;s independent local brands, in one place.</p>
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
