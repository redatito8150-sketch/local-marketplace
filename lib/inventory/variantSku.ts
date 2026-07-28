// Deterministic variant SKU construction: {product SKU}-{token}-{token}...
// in the product's own declared option order (e.g. Color then Size), using
// each selected option value's stable sku_token — never the current label,
// so a later label edit can never change an already-generated SKU. Pure/
// testable; the actual uniqueness guarantee comes from the DB's UNIQUE
// constraint on product_variants.sku plus a retry-with-suffix loop at the
// call site (collisions are only possible if two different value labels
// happen to produce the same token, which is rare but not impossible).
export function buildVariantSkuBase(productSku: string, tokensInOptionOrder: string[]): string {
  if (tokensInOptionOrder.length === 0) return productSku;
  return [productSku, ...tokensInOptionOrder].join("-");
}

export function buildVariantSkuWithSuffix(base: string, attempt: number): string {
  return attempt === 0 ? base : `${base}-${attempt + 1}`;
}
