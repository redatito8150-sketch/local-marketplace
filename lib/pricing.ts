// A product's `price` is always its permanent base price. A discount is
// just a percentage plus an optional end time (undefined/null end = runs
// forever) — the actual charged/displayed price is always computed fresh
// from these two fields, never stored. That's what makes a discount revert
// to the base price the instant it expires: there's nothing to revert,
// the math is just re-evaluated on the next read.

export function getEffectivePrice(
  basePrice: number,
  discountPercent?: number | null,
  discountEndsAt?: string | null,
  now: Date = new Date()
): number {
  if (!isDiscountActive(discountPercent, discountEndsAt, now)) return basePrice;
  return Math.round(basePrice * (1 - discountPercent! / 100) * 100) / 100;
}

export function isDiscountActive(
  discountPercent?: number | null,
  discountEndsAt?: string | null,
  now: Date = new Date()
): boolean {
  if (!discountPercent || discountPercent <= 0) return false;
  if (discountEndsAt && now.getTime() >= new Date(discountEndsAt).getTime()) return false;
  return true;
}

export function discountSavings(
  basePrice: number,
  discountPercent?: number | null,
  discountEndsAt?: string | null,
  now: Date = new Date()
): number {
  return basePrice - getEffectivePrice(basePrice, discountPercent, discountEndsAt, now);
}
