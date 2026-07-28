// Variant Price is the final selling price for that variant, not an
// adjustment/delta — null means "use the product's own base Price".
export function effectiveVariantPrice(
  variantPrice: number | null | undefined,
  productPrice: number
): number {
  return variantPrice ?? productPrice;
}
