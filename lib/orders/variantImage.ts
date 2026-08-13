import type { ProductVariant } from "@/types";

export interface ProductColorMediaRow {
  product_id: string;
  storage_reference: string;
  color_option_value_id: string | null;
}

export function buildColorImageLookup(rows: ProductColorMediaRow[]) {
  const images = new Map<string, string>();
  for (const row of rows) {
    if (!row.color_option_value_id || !row.storage_reference?.trim()) continue;
    const key = `${row.product_id}:${row.color_option_value_id}`;
    if (!images.has(key)) images.set(key, row.storage_reference.trim());
  }
  return images;
}

export function resolveVariantImage(
  productId: string,
  variant: Pick<ProductVariant, "optionValues"> | undefined,
  colorImages: Map<string, string>,
  fallback?: string | null
) {
  const color = variant?.optionValues.find(
    (value) => value.optionTypeName.trim().toLowerCase() === "color"
  );
  const exact = color
    ? colorImages.get(`${productId}:${color.optionValueId}`)
    : undefined;
  return exact ?? fallback?.trim() ?? "";
}
