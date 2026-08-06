// Ascending display order for every size label this app already
// recognizes (mirrors the vocabulary in sizeProfiles.ts's
// profileForSizeLabel, just as an explicit rank table instead of a
// classifier) — smallest first, always. Used by the Variants Matrix
// (top to bottom) and the product page's size selector (left to right).
const LETTER_SIZE_ORDER = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL"];

function sizeRank(label: string): number {
  const normalized = label.trim().toUpperCase();
  const letterIndex = LETTER_SIZE_ORDER.indexOf(normalized);
  if (letterIndex !== -1) return letterIndex;

  // EU shoe sizes ("EU 38") and plain numeric sizes (waist, kids age,
  // ring size, ...) both sort numerically, placed after every recognized
  // letter size.
  const numericMatch = normalized.match(/^(?:EU\s*)?(\d+(?:\.\d+)?)$/);
  if (numericMatch) return LETTER_SIZE_ORDER.length + Number(numericMatch[1]);

  // Unrecognized labels ("One Size", custom sizes, age ranges like
  // "6-12 Months", ...) sort after everything else, in whatever order
  // they were already in — every one gets the same rank, and
  // Array.prototype.sort is stable, so that relative order is preserved
  // rather than shuffled.
  return Number.POSITIVE_INFINITY;
}

export function compareSizeLabels(a: string, b: string): number {
  return sizeRank(a) - sizeRank(b);
}

export function sortByLabel<T>(items: T[], getLabel: (item: T) => string): T[] {
  return [...items].sort((a, b) => compareSizeLabels(getLabel(a), getLabel(b)));
}
