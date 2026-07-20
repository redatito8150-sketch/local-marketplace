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
