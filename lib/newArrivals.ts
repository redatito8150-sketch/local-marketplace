// "New" is no longer a manually-set flag — a product counts as New purely
// from when it was actually published, for exactly 20 days, and only while
// it's actually published (Draft/Archived never count, no matter what
// publish_date says). Computed fresh on every read, not stored/cached, so
// it's always correct without any scheduled job to flip a flag off.
export const NEW_ARRIVAL_WINDOW_DAYS = 20;

export function isWithinNewArrivalWindow(status: string, publishDate: string | null | undefined): boolean {
  if (status !== "published" || !publishDate) return false;
  const publishedAt = new Date(publishDate).getTime();
  if (Number.isNaN(publishedAt)) return false;
  const ageMs = Date.now() - publishedAt;
  return ageMs >= 0 && ageMs < NEW_ARRIVAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
