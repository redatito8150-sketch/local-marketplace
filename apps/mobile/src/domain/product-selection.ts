export type SelectableVariant = {
  size: string | null;
  color: string | null;
  price_override: number | null;
};

export function findProductVariant<T extends SelectableVariant>(
  variants: T[] | undefined,
  size: string,
  color: string
) {
  const normalizedSize = size.trim().toLowerCase();
  const normalizedColor = color.trim().toLowerCase();
  return variants?.find((variant) =>
    (variant.size ?? "").trim().toLowerCase() === normalizedSize &&
    (variant.color ?? "").trim().toLowerCase() === normalizedColor
  );
}

export function resolveProductPrice(
  product: { price: number },
  variant?: SelectableVariant
) {
  return variant?.price_override ?? product.price;
}

export function isProductSelectionUnavailable(input: {
  hasVariants: boolean;
  selectedVariant?: SelectableVariant & { availability_status?: string; quantity?: number };
  tracksInventory: boolean;
  selectedSize: string;
  unavailableSizes: string[];
}) {
  const { hasVariants, selectedVariant, tracksInventory, selectedSize, unavailableSizes } = input;
  return Boolean(
    (hasVariants && (!selectedVariant || selectedVariant.availability_status !== "available")) ||
    (tracksInventory && selectedVariant && (selectedVariant.quantity ?? 0) < 1) ||
    unavailableSizes.includes(selectedSize)
  );
}
