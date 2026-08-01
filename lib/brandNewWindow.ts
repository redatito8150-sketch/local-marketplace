// Brand equivalent of lib/newArrivals.ts's product "New" window — a brand
// has no separate "went live" timestamp the way a product has
// `publish_date`, so `created_at` (set once, at conversion time) is the
// practical stand-in here. Computed fresh on every read, never stored, so
// there's nothing to expire via a scheduled job — the badge just stops
// appearing once the window passes, while the brand itself stays wherever
// it's ranked in the Featured Brands list.
export const BRAND_NEW_WINDOW_DAYS = 30;

export function isWithinNewBrandWindow(createdAt: string | null | undefined, isActive: boolean): boolean {
  if (!isActive || !createdAt) return false;
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return false;
  const ageMs = Date.now() - createdAtMs;
  return ageMs >= 0 && ageMs < BRAND_NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
