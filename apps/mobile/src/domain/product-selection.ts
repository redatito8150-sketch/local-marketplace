import { getEffectivePrice, isDiscountActive } from "./pricing.ts";

export type SelectableVariant = {
  optionValues: { optionTypeName: string; label: string }[];
  variant_price: number | null;
  variant_discount_percent?: number | null;
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
  product: { price: number; discount_percent?: number | null; discount_ends_at?: string | null },
  variant?: SelectableVariant,
  now: Date = new Date()
) {
  return resolveProductPricing(product, variant, now).price;
}

export function resolveProductPricing(
  product: { price: number; discount_percent?: number | null; discount_ends_at?: string | null },
  variant?: SelectableVariant,
  now: Date = new Date()
) {
  const basePrice = variant?.variant_price ?? product.price;
  const variantDiscount = variant?.variant_discount_percent;
  if (variantDiscount && variantDiscount > 0 && variantDiscount < 100) {
    return {
      basePrice,
      price: Math.round(basePrice * (1 - variantDiscount / 100) * 100) / 100,
      active: true,
      percent: variantDiscount,
    };
  }

  const active = isDiscountActive(product.discount_percent, product.discount_ends_at, now);
  return {
    basePrice,
    price: getEffectivePrice(basePrice, product.discount_percent, product.discount_ends_at, now),
    active,
    percent: active ? product.discount_percent ?? undefined : undefined,
  };
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
