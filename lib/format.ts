export type Currency = "USD" | "EGP";

/**
 * Formats a price for display. Used everywhere a price is shown
 * (product cards, product detail, cart, wishlist, search, checkout)
 * so the formatting rule only needs to change in one place.
 */
export function formatPrice(price: number, currency: Currency): string {
  if (currency === "EGP") return `${price.toLocaleString()} EGP`;
  return `$${price.toFixed(2)}`;
}
