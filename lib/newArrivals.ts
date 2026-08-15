// "New" is no longer a manually-set flag — a product counts as New purely
// from when it actually first became visible to a real customer
// (products.first_visible_at), for exactly 20 days, and only while it's
// actually published (Draft/Archived never count). Computed fresh on every
// read, not stored/cached, so it's always correct without any scheduled
// job to flip a flag off. Using first_visible_at (not publish_date) means
// a when_stocked product's hidden publish time never starts this clock —
// it only starts once a real customer could actually see the product; see
// private.stamp_product_first_visible_if_eligible() (supabase/migrations/
// 20260815000000_product_launch_policy_and_opening_stock.sql).
export const NEW_ARRIVAL_WINDOW_DAYS = 20;

export function isWithinNewArrivalWindow(status: string, firstVisibleAt: string | null | undefined): boolean {
  if (status !== "published" || !firstVisibleAt) return false;
  const visibleAt = new Date(firstVisibleAt).getTime();
  if (Number.isNaN(visibleAt)) return false;
  const ageMs = Date.now() - visibleAt;
  return ageMs >= 0 && ageMs < NEW_ARRIVAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

// True scheduled publishing: a product's Publish Date field (set in the
// admin/brand-portal editor) previously did nothing but drive the "New"
// badge window above — status: "published" alone made it fully live
// immediately, regardless of a future publish_date. This is the single-row
// check (product detail page); publishDateLiveFilter() below is the same
// rule as a Supabase query filter for list queries.
export function isPublishDateLive(publishDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!publishDate) return true;
  const publishedAt = new Date(publishDate).getTime();
  if (Number.isNaN(publishedAt)) return true;
  return publishedAt <= now.getTime();
}

// Supabase .or() filter string for the same rule, for list queries —
// chain after .eq("status", "published") (same convention already used
// for the discount_ends_at null-or-expired check in getMarketplaceCatalogPage).
export function publishDateLiveFilter(now: Date = new Date()): string {
  return `publish_date.is.null,publish_date.lte.${now.toISOString()}`;
}
