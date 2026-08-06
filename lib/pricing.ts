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

// A variant's discount and the product's own discount are mutually
// exclusive (enforced at save time — see lib/admin/productValidation.ts),
// so a variant only ever needs to check one or the other, never combine
// them. The variant discount has no separate end-time of its own (it's a
// simple per-color markdown, not a time-bound promotion like the
// product-level one) — it's just active for as long as it's set.
export function getVariantEffectivePrice(
  productPrice: number,
  variantPrice: number | null | undefined,
  productDiscountPercent: number | null | undefined,
  productDiscountEndsAt: string | null | undefined,
  variantDiscountPercent: number | null | undefined,
  now: Date = new Date()
): { price: number; active: boolean; percent?: number } {
  const base = variantPrice ?? productPrice;
  if (variantDiscountPercent && variantDiscountPercent > 0) {
    return { price: Math.round(base * (1 - variantDiscountPercent / 100) * 100) / 100, active: true, percent: variantDiscountPercent };
  }
  const active = isDiscountActive(productDiscountPercent, productDiscountEndsAt, now);
  return {
    price: active ? getEffectivePrice(base, productDiscountPercent, productDiscountEndsAt, now) : base,
    active,
    percent: productDiscountPercent ?? undefined,
  };
}
