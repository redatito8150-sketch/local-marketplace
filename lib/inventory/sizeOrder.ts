// Ascending display order for size labels — smallest first, always. Used
// by the Variants Matrix (top to bottom) and the product page's size
// selector (left to right).
//
// Two different signals feed this, and it's important not to blur them:
//
// 1. A *shared/system* size (Color/Size option values with brand_id null
//    — XS, M, "One Size", "3–6 Months", "EU 38", waist numerics, ...) has
//    its own real, already-correct `sort_order` seeded in the DB (see
//    supabase/migrations/20260808000010_reseed_system_option_types.sql).
//    That's the authoritative rank — used directly, never guessed from
//    the label text. Pattern-matching the text instead (an earlier
//    version of this file did) is incomplete by construction: "One Size"
//    and "3–6 Months" are real, correctly-seeded system sizes with no
//    letter/numeric pattern to match, and would have been wrongly swept
//    into the "custom" bucket below.
// 2. A *custom* (brand-owned, brand_id set) size like "S/M" has no
//    inherent rank at all — its position is a real decision a brand
//    makes with the up/down arrows in the Matrix, encoded as a zone
//    below.
const LETTER_SIZE_ORDER = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL"];

// Text-based fallback only — used when brandId isn't available at all
// (see zonedRank below). Covers the common cases but, unlike the DB's own
// sort_order, is not exhaustive (doesn't know about "One Size" or age
// ranges) — never treat this as authoritative when brandId is known.
function knownSizeRank(label: string): number {
  const normalized = label.trim().toUpperCase();
  const letterIndex = LETTER_SIZE_ORDER.indexOf(normalized);
  if (letterIndex !== -1) return letterIndex;
  const numericMatch = normalized.match(/^(?:EU\s*)?(\d+(?:\.\d+)?)$/);
  if (numericMatch) return LETTER_SIZE_ORDER.length + Number(numericMatch[1]);
  return Number.POSITIVE_INFINITY;
}

export function compareSizeLabels(a: string, b: string): number {
  return knownSizeRank(a) - knownSizeRank(b);
}

export function sortByLabel<T>(items: T[], getLabel: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareSizeLabels(getLabel(a), getLabel(b)));
}

// ── Custom (brand-defined) size ordering ────────────────────────────────
//
// A shared/system size's position is never negotiable, and a custom size
// can never be inserted *between* two of them — only before the whole
// run of them, or after it. That's encoded as a zone, itself encoded as
// a range of the custom value's real `sort_order` column (already
// existed, previously always left at its DB default of 0):
//
// - BEFORE_ZONE: sort_order <= -1 (closer to -1 = closer to the system
//   block; more negative = further toward the very front).
// - AFTER_ZONE: sort_order >= AFTER_ZONE_BASE (closer to AFTER_ZONE_BASE
//   = closer to the system block; larger = further toward the end).
// - Anything else (including the untouched default of 0) is treated as
//   not yet zoned — same old stable "keep whatever order it already
//   arrived in" fallback, so nothing changes for a custom size until a
//   brand actually creates or reorders one (see nextAfterZoneSortOrder
//   and reorderCustomSize below).
export const CUSTOM_AFTER_ZONE_BASE = 100_000;

export interface SizeOrderable {
  id: string;
  label: string;
  sortOrder?: number | null;
  // null/a real id = definitely known (shared) vs. definitely custom
  // (brand-owned). `undefined` means "the caller doesn't have this info"
  // — falls back to the (incomplete) text-based guess above.
  brandId?: string | null;
}

export function isCustomSizeValue(item: Pick<SizeOrderable, "label" | "brandId">): boolean {
  if (item.brandId !== undefined) return Boolean(item.brandId);
  return knownSizeRank(item.label) === Number.POSITIVE_INFINITY;
}

function zonedRank(item: SizeOrderable): number {
  if (!isCustomSizeValue(item)) {
    // Shared/system value — its own sort_order is the authoritative
    // rank (covers every seeded label, not just the ones this file's
    // text patterns happen to recognize). Only falls back to the text
    // guess if sort_order itself is somehow missing.
    return item.sortOrder ?? knownSizeRank(item.label);
  }
  const so = item.sortOrder ?? 0;
  if (so < 0) return so; // before-zone — already < any system rank (>= 0)
  if (so >= CUSTOM_AFTER_ZONE_BASE) return so; // after-zone — already > any real system rank
  return Number.POSITIVE_INFINITY; // not yet zoned — old stable fallback
}

export function compareSizeOrderables(a: SizeOrderable, b: SizeOrderable): number {
  return zonedRank(a) - zonedRank(b);
}

export function sortSizeOrderables<T extends SizeOrderable>(items: T[]): T[] {
  return [...items].sort((a, b) => compareSizeOrderables(a, b));
}

// The sort_order a brand-new custom value should be created with — always
// appended at the very end of the (possibly empty) after-zone, matching
// "a new custom size shows up last" as the default, moved earlier only if
// the brand explicitly does so afterward.
export function nextAfterZoneSortOrder(existingSortOrders: (number | null | undefined)[]): number {
  const afterZoneValues = existingSortOrders.filter(
    (value): value is number => typeof value === "number" && value >= CUSTOM_AFTER_ZONE_BASE
  );
  return afterZoneValues.length ? Math.max(...afterZoneValues) + 1 : CUSTOM_AFTER_ZONE_BASE;
}

// Computes the new sort_order for every custom value that needs one
// changed to move `targetId` one step up/down, honoring the
// never-between-shared-sizes rule. Returns null if the move isn't
// possible (target not found, target is itself a shared/system size, or
// it's already at the extreme edge in that direction).
//
// Also self-heals: any custom value not yet in a zone (still at its
// untouched default) gets folded into whichever zone it's currently
// effectively sitting in (via the same stable fallback used for display)
// the first time *any* value in the list is reordered — so the feature
// works correctly the moment a brand starts using it, with no migration.
export function reorderCustomSize(
  allValues: SizeOrderable[],
  targetId: string,
  direction: "up" | "down"
): { id: string; sortOrder: number }[] | null {
  const ordered = sortSizeOrderables(allValues);
  const targetIndex = ordered.findIndex((v) => v.id === targetId);
  if (targetIndex === -1) return null;
  if (!isCustomSizeValue(ordered[targetIndex])) return null; // shared sizes aren't manually reorderable

  const firstKnownIndex = ordered.findIndex((v) => !isCustomSizeValue(v));
  const lastKnownIndex = (() => {
    for (let i = ordered.length - 1; i >= 0; i--) if (!isCustomSizeValue(ordered[i])) return i;
    return -1;
  })();

  // No shared sizes at all yet — every custom value is trivially in one
  // zone (the after-zone, by convention) until a shared size is added
  // and actually splits the list.
  const before = firstKnownIndex === -1 ? [] : ordered.slice(0, firstKnownIndex);
  const after = firstKnownIndex === -1 ? [...ordered] : ordered.slice(lastKnownIndex + 1);

  const inBefore = before.some((v) => v.id === targetId);
  const zone = inBefore ? before : after;
  const zoneIndex = zone.findIndex((v) => v.id === targetId);

  if (direction === "up") {
    if (inBefore) {
      if (zoneIndex === 0) return null; // already frontmost
      swap(zone, zoneIndex - 1, zoneIndex);
    } else if (zoneIndex === 0) {
      // Crossing from the after-zone into the before-zone, landing right
      // up against the shared block from the other side.
      const [target] = after.splice(zoneIndex, 1);
      before.push(target);
    } else {
      swap(zone, zoneIndex - 1, zoneIndex);
    }
  } else {
    if (!inBefore) {
      if (zoneIndex === zone.length - 1) return null; // already at the very end
      swap(zone, zoneIndex, zoneIndex + 1);
    } else if (zoneIndex === zone.length - 1) {
      const [target] = before.splice(zoneIndex, 1);
      after.unshift(target);
    } else {
      swap(zone, zoneIndex, zoneIndex + 1);
    }
  }

  const result: { id: string; sortOrder: number }[] = [];
  before.forEach((v, i) => result.push({ id: v.id, sortOrder: -(before.length - i) }));
  after.forEach((v, i) => result.push({ id: v.id, sortOrder: CUSTOM_AFTER_ZONE_BASE + i }));
  return result;
}

function swap<T>(arr: T[], i: number, j: number): void {
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
