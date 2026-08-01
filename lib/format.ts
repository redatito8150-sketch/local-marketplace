import type { Product, ProductVariant } from "@/types";
import { getEffectivePrice } from "./pricing.ts";

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

// Mahaly is an Egypt-only marketplace — every timestamp shown to an admin
// or brand owner should read as Cairo local time, not whatever timezone
// happens to run the process. Most timestamp displays in this app are
// server components (Next.js renders `new Date(...).toLocaleString()` on
// the Node server, not in the viewer's browser), so relying on the
// runtime's local timezone silently shows server time (commonly UTC)
// instead of Cairo time — pinning `timeZone` here fixes that regardless of
// where the code actually executes.
const SITE_TIMEZONE = "Africa/Cairo";

/** e.g. "Aug 7, 2026, 3:45 PM" in Cairo local time, from any ISO/parsable timestamp. */
export function formatDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString("en-US", {
    timeZone: SITE_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** e.g. "Aug 7, 2026" in Cairo local time, from any ISO/parsable timestamp. */
export function formatDateOnly(value: string | number | Date): string {
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: SITE_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * The one price-resolution rule used everywhere a product's active price is
 * charged or totaled (cart add, Complete Featured Look total): Variant
 * Price is the final price when set, otherwise the product's own base
 * price — with any active time-bound discount (lib/pricing.ts) applied on
 * top of whichever of those two is in effect.
 */
export function resolveActivePrice(
  product: Pick<Product, "price" | "discountPercent" | "discountEndsAt">,
  variant?: Pick<ProductVariant, "variantPrice">
): number {
  return getEffectivePrice(variant?.variantPrice ?? product.price, product.discountPercent, product.discountEndsAt);
}

/**
 * Sums a set of products' active prices (e.g. a Complete Featured Look).
 * Accumulates in integer cents so repeated float addition can't drift a
 * displayed total by fractions of a piaster.
 */
export function calculateCollectionTotal<T extends Pick<Product, "price" | "discountPercent" | "discountEndsAt">>(
  products: T[],
  resolveVariant?: (product: T) => Pick<ProductVariant, "variantPrice"> | undefined
): number {
  const totalCents = products.reduce((sum, product) => {
    const variant = resolveVariant?.(product);
    return sum + Math.round(resolveActivePrice(product, variant) * 100);
  }, 0);
  return totalCents / 100;
}
