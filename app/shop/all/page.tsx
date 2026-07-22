import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AllProductsShoppingArea from "@/components/category/AllProductsShoppingArea";
import { getMarketplaceCatalogFacets, getMarketplaceCatalogPage, type MarketplaceCatalogFilters } from "@/lib/data/products";
import { buildMarketplaceFilterGroups } from "@/lib/filters";
import type { SortOption } from "@/types";
import { CATALOG_FILTER_QUERY_KEYS, parseCatalogFilterValues } from "@/lib/catalogQuery";

export const metadata: Metadata = { title: "Shop All Products — Mahaly", description: "Browse active products from independent local brands across the Mahaly marketplace." };
export const revalidate = 60;

const SORTS = new Set<SortOption>(["newest", "price-asc", "price-desc", "top-rated"]);

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function ShopAllPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await props.searchParams;
  const facets = await getMarketplaceCatalogFacets();
  const filterGroups = buildMarketplaceFilterGroups(facets);
  const allowed = new Map(filterGroups.map((group) => [group.id, new Set(group.options.map((option) => option.id))]));
  const filters: MarketplaceCatalogFilters = {};
  for (const key of CATALOG_FILTER_QUERY_KEYS) {
    const selected = parseCatalogFilterValues(params[key]).filter((value) => allowed.get(key)?.has(value));
    if (selected.length) filters[key] = selected;
  }
  if (filters.productCategory?.length && filters.productType?.length) {
    const supported = new Set(facets.filter((facet) => facet.productCategory && filters.productCategory?.includes(facet.productCategory)).map((facet) => facet.productType).filter((type): type is string => Boolean(type)));
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
  return <main className="min-h-screen bg-cream"><Header /><AllProductsShoppingArea key={stateKey} products={result.products} filterGroups={filterGroups} productTypeRelations={facets.map(({ productCategory, productType }) => ({ productCategory, productType }))} selected={filters as Record<string, string[]>} sort={sort} search={search} total={result.total} page={result.page} totalPages={totalPages} /><Footer /></main>;
}
