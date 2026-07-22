export const CATALOG_FILTER_QUERY_KEYS = [
  "audience", "brand", "productCategory", "productType", "collection", "material",
  "fit", "size", "color", "price", "availability", "rating", "featured", "discounted",
] as const;

export type CatalogFilterQueryKey = (typeof CATALOG_FILTER_QUERY_KEYS)[number];

const SAFE_FILTER_VALUE = /^[\p{L}\p{N}\s&+'-]{1,80}$/u;

export function parseCatalogFilterValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value.flatMap((entry) => entry.split(",")) : value?.split(",") ?? [];
  return Array.from(new Set(values.map((item) => item.trim()).filter((item) => SAFE_FILTER_VALUE.test(item)))).slice(0, 20);
}
