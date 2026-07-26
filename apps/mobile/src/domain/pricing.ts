export function formatPrice(amount: number, currency: "EGP" | "USD") {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "EGP" ? 0 : 2,
  }).format(amount);
}

export function calculateDiscountPercent(price: number, compareAtPrice?: number | null) {
  if (!Number.isFinite(price) || !Number.isFinite(compareAtPrice) || !compareAtPrice || compareAtPrice <= price) return 0;
  return Math.round((1 - price / compareAtPrice) * 100);
}
