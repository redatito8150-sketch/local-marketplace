import type { FilterGroup, Product } from "@/types";
import type { MarketplaceCatalogFacetRow } from "@/lib/data/products";
import { isDiscountActive } from "./pricing.ts";

// Fallback price bounds when no products are available to derive a real
// range from (e.g. an empty catalog) — the project's own configured floor
// and ceiling rather than an arbitrary guess.
export const DEFAULT_PRICE_BOUNDS = { min: 0, max: 10000 };

// The real, currently-available product-price range, derived from actual
// catalog data rather than a hardcoded bucket list — used to bound the
// Price filter's slider/inputs. Falls back to DEFAULT_PRICE_BOUNDS when no
// priced products are available.
export function derivePriceBounds(products: { price: number }[]): { min: number; max: number } {
  const prices = products.map((product) => product.price).filter((price) => Number.isFinite(price));
  if (prices.length === 0) return DEFAULT_PRICE_BOUNDS;
  return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
}

// The Price filter stores its selection as a single "min-max" encoded
// string (rather than the old multi-select bucket ids) so it round-trips
// through the same selected-filter arrays and URL query params everywhere
// else in the catalog filtering system without changing that architecture.
export function encodePriceRangeValue(min: number, max: number): string {
  return `${Math.round(min)}-${Math.round(max)}`;
}

export function parsePriceRangeValue(value: string | undefined): { min: number; max: number } | null {
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(value);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  return { min, max };
}

function countedGroup(id: string, title: string, values: (string | undefined)[]): FilterGroup {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return {
    id,
    title,
    // Using the real value as both id and label (rather than a slugified
    // id) keeps matching a direct string comparison, no reverse lookup.
    options: [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ id: label, label, count })),
  };
}

// The Price group no longer carries a discrete option list — it's rendered
// as a min/max range control (PriceRangeFilter) wherever `group.id ===
// "price"` is special-cased, so this is just a stable marker for that
// group's id/title/ordering among the other filter groups.
const PRICE_GROUP: FilterGroup = { id: "price", title: "Price", options: [] };

const AVAILABILITY_GROUP: FilterGroup = {
  id: "availability",
  title: "Availability",
  options: [
    { id: "in-stock", label: "In Stock" },
    { id: "out-of-stock", label: "Out of Stock" },
  ],
};

const RATING_GROUP: FilterGroup = {
  id: "rating",
  title: "Rating",
  options: [
    { id: "4-plus", label: "4 Stars & Up" },
    { id: "3-plus", label: "3 Stars & Up" },
  ],
};

const FEATURED_GROUP: FilterGroup = {
  id: "featured",
  title: "Featured",
  options: [{ id: "featured-only", label: "Featured Products" }],
};

const DISCOUNTED_GROUP: FilterGroup = {
  id: "discounted",
  title: "Discounted",
  options: [{ id: "discounted-only", label: "On Sale" }],
};

export type ProductFacet = MarketplaceCatalogFacetRow;

export function buildMarketplaceFilterGroups(products: ProductFacet[]): FilterGroup[] {
  const groups: FilterGroup[] = [
    countedGroup("audience", "Audience", products.map((product) => product.category)),
    countedGroup("brand", "Brand", products.map((product) => product.brand)),
    PRICE_GROUP,
    countedGroup("size", "Size", products.flatMap((product) => product.sizes)),
    countedGroup("color", "Color", products.flatMap((product) => product.colors.map((color) => color.name))),
    countedGroup("mainCategory", "Category", products.map((product) => product.mainCategory)),
    countedGroup("productType", "Product Type", products.map((product) => product.productType)),
    countedGroup("collection", "Collection", products.map((product) => product.collection)),
    countedGroup("material", "Material", products.map((product) => product.material)),
    countedGroup("fit", "Fit", products.map((product) => product.fit)),
    AVAILABILITY_GROUP,
    RATING_GROUP,
    FEATURED_GROUP,
    ...(products.some((product) => isDiscountActive(product.discountPercent, product.discountEndsAt)) ? [DISCOUNTED_GROUP] : []),
  ];
  // Price has no discrete option list (it's a range control) so it's kept
  // whenever there's at least one priced product, unlike every other group
  // here which is dropped once its real option list comes back empty.
  return groups.filter((group) => group.id === "price" ? products.length > 0 : group.options.length > 0);
}

// Filter options are derived from whatever products are actually being
// shown on this page (real brand names, real taxonomy values, real
// sizes/colors) instead of a hardcoded list disconnected from the catalog.
// Groups with no real options on this page (e.g. nothing has a Fit set
// yet) are dropped so the sidebar doesn't show empty sections. Builds
// directly off `Product[]` (already-resolved taxonomy/collection display
// names) rather than reusing buildMarketplaceFilterGroups, whose
// ProductFacet shape comes from a separate, unresolved facet query.
export function buildDynamicFilterGroups(products: Product[]): FilterGroup[] {
  const groups: FilterGroup[] = [
    countedGroup("audience", "Audience", products.map((product) => product.category)),
    countedGroup("brand", "Brand", products.map((product) => product.brand)),
    PRICE_GROUP,
    countedGroup("size", "Size", products.flatMap((product) => product.sizes)),
    countedGroup("color", "Color", products.flatMap((product) => product.colors.map((color) => color.name))),
    countedGroup("mainCategory", "Category", products.map((product) => product.mainCategory)),
    countedGroup("productType", "Product Type", products.map((product) => product.productTypeName)),
    countedGroup("collection", "Collection", products.map((product) => product.collectionName)),
    countedGroup("material", "Material", products.map((product) => product.material)),
    countedGroup("fit", "Fit", products.map((product) => product.fit)),
    AVAILABILITY_GROUP,
    RATING_GROUP,
    FEATURED_GROUP,
    ...(products.some((product) => isDiscountActive(product.discountPercent, product.discountEndsAt)) ? [DISCOUNTED_GROUP] : []),
  ];
  return groups.filter((group) => group.id === "price" ? products.length > 0 : group.options.length > 0);
}
