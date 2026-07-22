import type { FilterGroup, Product } from "@/types";

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

const PRICE_GROUP: FilterGroup = {
  id: "price",
  title: "Price",
  options: [
    { id: "under-500", label: "Under 500 EGP" },
    { id: "500-1000", label: "500 - 1,000 EGP" },
    { id: "1000-2000", label: "1,000 - 2,000 EGP" },
    { id: "2000-5000", label: "2,000 - 5,000 EGP" },
    { id: "above-5000", label: "Above 5,000 EGP" },
  ],
};

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

export type ProductFacet = Pick<Product, "brand" | "category" | "sizes" | "colors" | "productCategory" | "productType" | "collection" | "material" | "fit" | "compareAtPrice">;

export function buildMarketplaceFilterGroups(products: ProductFacet[]): FilterGroup[] {
  const groups: FilterGroup[] = [
    countedGroup("audience", "Audience", products.map((product) => product.category)),
    countedGroup("brand", "Brand", products.map((product) => product.brand)),
    PRICE_GROUP,
    countedGroup("size", "Size", products.flatMap((product) => product.sizes)),
    countedGroup("color", "Color", products.flatMap((product) => product.colors.map((color) => color.name))),
    countedGroup("productCategory", "Category", products.map((product) => product.productCategory)),
    countedGroup("productType", "Product Type", products.map((product) => product.productType)),
    countedGroup("collection", "Collection", products.map((product) => product.collection)),
    countedGroup("material", "Material", products.map((product) => product.material)),
    countedGroup("fit", "Fit", products.map((product) => product.fit)),
    AVAILABILITY_GROUP,
    RATING_GROUP,
    FEATURED_GROUP,
    ...(products.some((product) => product.compareAtPrice != null) ? [DISCOUNTED_GROUP] : []),
  ];
  return groups.filter((group) => group.options.length > 0);
}

// Filter options are derived from whatever products are actually being
// shown on this page (real brand names, real taxonomy values, real
// sizes/colors) instead of a hardcoded list disconnected from the catalog.
// Groups with no real options on this page (e.g. nothing has a Fit set
// yet) are dropped so the sidebar doesn't show empty sections.
export function buildDynamicFilterGroups(products: Product[]): FilterGroup[] {
  return buildMarketplaceFilterGroups(products);
}
