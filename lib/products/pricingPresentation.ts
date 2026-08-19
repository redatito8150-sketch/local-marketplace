import { getVariantEffectivePrice } from "../pricing.ts";

export type ProductPricingVariant = {
  variantPrice?: number | null;
  variantDiscountPercent?: number | null;
  sellingStatus?: string;
  isArchived?: boolean;
};

export type ProductPricingSource = {
  price: number;
  discountPercent?: number | null;
  discountEndsAt?: string | null;
  variants?: ProductPricingVariant[];
};

export type ProductPricePresentation = {
  currentMin: number;
  currentMax: number;
  originalMin: number;
  originalMax: number;
  hasDiscount: boolean;
  discountLabel?: string;
};

/**
 * Resolves the live catalog price across every active Variant. This is the
 * canonical list/table presentation used by both Admin and Brand Portal so
 * neither surface falls back to the product's undiscounted base price.
 */
export function getProductPricePresentation(
  product: ProductPricingSource,
  now: Date = new Date()
): ProductPricePresentation {
  const activeVariants = (product.variants ?? []).filter(
    (variant) => !variant.isArchived && (!variant.sellingStatus || variant.sellingStatus === "active")
  );
  const pricingVariants = activeVariants.length ? activeVariants : [{}];
  const resolved = pricingVariants.map((variant) => getVariantEffectivePrice(
    product.price,
    variant.variantPrice,
    product.discountPercent,
    product.discountEndsAt,
    variant.variantDiscountPercent,
    now
  ));
  const currentPrices = resolved.map((value) => value.price);
  const originalPrices = resolved.map((value) => value.base);
  const discounted = resolved.filter((value) => value.active && value.price < value.base);
  const productDiscount = discounted.find((value) => value.source === "product_discount");
  const variantDiscounts = discounted.filter((value) => value.source === "variant_discount");
  const maxVariantDiscount = Math.max(0, ...variantDiscounts.map((value) => value.percent ?? 0));

  return {
    currentMin: Math.min(...currentPrices),
    currentMax: Math.max(...currentPrices),
    originalMin: Math.min(...originalPrices),
    originalMax: Math.max(...originalPrices),
    hasDiscount: discounted.length > 0,
    discountLabel: productDiscount?.percent
      ? `${productDiscount.percent}% off`
      : maxVariantDiscount > 0
        ? `Up to ${maxVariantDiscount}% off`
        : undefined,
  };
}

