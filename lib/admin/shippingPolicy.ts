// Shipping & Returns is no longer edited per-product — it's resolved from
// the owning Brand's policy fields, falling back to one fixed marketplace
// default. See supabase/migrations/20260803000003_product_details_rebuild.sql
// for the brands.shipping_policy/return_policy/return_window_days columns.

export const MARKETPLACE_DEFAULT_RETURN_WINDOW_DAYS = 7;
export const MARKETPLACE_DEFAULT_POLICY_TEXT =
  "Returns are accepted within 7 days, subject to Mahaly's return policy.";

export interface BrandPolicyFields {
  shippingPolicy?: string | null;
  returnPolicy?: string | null;
  returnWindowDays?: number | null;
}

export type ShippingPolicySource = "brand" | "marketplace_default";

export interface ResolvedShippingPolicy {
  text: string;
  source: ShippingPolicySource;
  returnWindowDays: number;
}

// Priority: Brand policy first (any of its 3 fields set counts as "has a
// policy"), marketplace default otherwise. A Brand that only set a return
// window (no free text) still gets a sensible default sentence built from
// that window, rather than falling all the way back to the marketplace copy.
export function resolveShippingPolicy(brand: BrandPolicyFields | null | undefined): ResolvedShippingPolicy {
  const shipping = brand?.shippingPolicy?.trim() || "";
  const returns = brand?.returnPolicy?.trim() || "";
  const hasBrandPolicy = Boolean(shipping || returns || brand?.returnWindowDays);

  if (!hasBrandPolicy) {
    return {
      text: MARKETPLACE_DEFAULT_POLICY_TEXT,
      source: "marketplace_default",
      returnWindowDays: MARKETPLACE_DEFAULT_RETURN_WINDOW_DAYS,
    };
  }

  const windowDays = brand?.returnWindowDays ?? MARKETPLACE_DEFAULT_RETURN_WINDOW_DAYS;
  const segments = [shipping, returns || `Returns are accepted within ${windowDays} days.`].filter(Boolean);
  return { text: segments.join(" "), source: "brand", returnWindowDays: windowDays };
}
