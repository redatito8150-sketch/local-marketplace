export function formatPrice(amount: number, currency: "EGP" | "USD") {
  return new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "EGP" ? 0 : 2,
  }).format(amount);
}

export function isDiscountActive(
  discountPercent?: number | null,
  discountEndsAt?: string | null,
  now: Date = new Date()
) {
  if (!discountPercent || discountPercent <= 0 || discountPercent >= 100) return false;
  if (!discountEndsAt) return true;
  const endsAt = new Date(discountEndsAt).getTime();
  return Number.isFinite(endsAt) && now.getTime() < endsAt;
}

export function getEffectivePrice(
  basePrice: number,
  discountPercent?: number | null,
  discountEndsAt?: string | null,
  now: Date = new Date()
) {
  if (!isDiscountActive(discountPercent, discountEndsAt, now)) return basePrice;
  return Math.round(basePrice * (1 - discountPercent! / 100) * 100) / 100;
}
