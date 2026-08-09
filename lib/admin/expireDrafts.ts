export const DRAFT_EXPIRY_DAYS = 10;

// Days remaining before daily maintenance archives a draft. Archiving is
// reversible; rendering a page never mutates product data.
export function draftDaysRemaining(draftStartedAt: string | null | undefined): number | null {
  if (!draftStartedAt) return null;
  const elapsedMs = Date.now() - new Date(draftStartedAt).getTime();
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);
  return Math.ceil(DRAFT_EXPIRY_DAYS - elapsedDays);
}
