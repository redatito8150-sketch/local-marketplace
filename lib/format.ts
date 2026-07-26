import type { Product, ProductVariant } from "@/types";

export type Currency = "USD" | "EGP";

/**
 * Formats a price for display. Used everywhere a price is shown
 * (product cards, product detail, cart, wishlist, search, checkout)
 * so the formatting rule only needs to change in one place.
 */
export function formatPrice(price: number, currency: Currency): string {
  // Locale pinned explicitly — `toLocaleString()` with no locale argument
  // follows the runtime's default locale, which can differ between the
  // server (Node) and the browser and produces a real hydration mismatch
  // (e.g. Arabic-Indic "١٬٤٥٠" server-side vs "1,450" client-side).
  if (currency === "EGP") return `${price.toLocaleString("en-US")} EGP`;
  return `$${price.toFixed(2)}`;
}

/**
 * Formats a cart/order line's size for display. A product with no sizes
 * at all (a single default variant, color/size both unset) stores an
 * empty string as its *real* size — matching the underlying variant's
 * `size: null` so cart→order variant lookups and stock checks keep
 * working — and only turns into the human-readable "One Size" here, at
 * the display layer.
 */
export function formatSize(size: string): string {
  return size || "One Size";
}

/**
 * Compact display for a count (followers, etc.) — 1,240 -> "1.2K",
 * 18,600 -> "18.6K". Locale pinned to "en-US" for the same hydration-
 * mismatch reason as formatPrice.
 */
export function formatCompactNumber(value: number): string {
  if (value < 1000) return value.toLocaleString("en-US");
  return `${(value / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
}

/**
 * The one price-resolution rule used everywhere a product's active price is
 * charged or totaled (cart add, Complete Featured Look total): a variant's
 * override wins when one applies, otherwise the product's own price — which
 * is already the active/effective price (post-discount where relevant);
 * `compareAtPrice` is only ever the struck-through "was" price, never used
 * in a total.
 */
export function resolveActivePrice(
  product: Pick<Product, "price">,
  variant?: Pick<ProductVariant, "priceOverride">
): number {
  return variant?.priceOverride ?? product.price;
}

/**
 * Sums a set of products' active prices (e.g. a Complete Featured Look).
 * Accumulates in integer cents so repeated float addition can't drift a
 * displayed total by fractions of a piaster.
 */
export function calculateCollectionTotal<T extends Pick<Product, "price">>(
  products: T[],
  resolveVariant?: (product: T) => Pick<ProductVariant, "priceOverride"> | undefined
): number {
  const totalCents = products.reduce((sum, product) => {
    const variant = resolveVariant?.(product);
    return sum + Math.round(resolveActivePrice(product, variant) * 100);
  }, 0);
  return totalCents / 100;
}
