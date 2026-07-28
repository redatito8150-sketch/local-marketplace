export type SelectableVariant = {
  optionValues: { optionTypeName: string; label: string }[];
  variant_price: number | null;
};

export function findProductVariant<T extends SelectableVariant>(
  variants: T[] | undefined,
  size: string,
  color: string
) {
  const normalizedSize = size.trim().toLowerCase();
  const normalizedColor = color.trim().toLowerCase();
  return variants?.find((variant) => {
    const variantSize = (variant.optionValues.find((o) => o.optionTypeName === "Size")?.label ?? "")
      .trim()
      .toLowerCase();
    const variantColor = (variant.optionValues.find((o) => o.optionTypeName === "Color")?.label ?? "")
      .trim()
      .toLowerCase();
    return variantSize === normalizedSize && variantColor === normalizedColor;
  });
}

export function resolveProductPrice(
  product: { price: number },
  variant?: SelectableVariant
) {
  return variant?.variant_price ?? product.price;
}

// Every product now tracks inventory at variant level unconditionally —
// there is no "tracksInventory" toggle to check anymore, so a selected
// variant is only purchasable when it's Active *and* in stock.
export function isProductSelectionUnavailable(input: {
  hasVariants: boolean;
  selectedVariant?: SelectableVariant & { selling_status?: string; quantity?: number };
  selectedSize: string;
  unavailableSizes: string[];
}) {
  const { hasVariants, selectedVariant, selectedSize, unavailableSizes } = input;
  return Boolean(
    (hasVariants &&
      (!selectedVariant ||
        selectedVariant.selling_status !== "active" ||
        (selectedVariant.quantity ?? 0) < 1)) ||
    unavailableSizes.includes(selectedSize)
  );
}
