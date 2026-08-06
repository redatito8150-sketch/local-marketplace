import assert from "node:assert/strict";
import test from "node:test";
import {
  compareSizeLabels,
  sortByLabel,
  sortSizeOrderables,
  nextAfterZoneSortOrder,
  reorderCustomSize,
  CUSTOM_AFTER_ZONE_BASE,
  type SizeOrderable,
} from "../lib/inventory/sizeOrder.ts";

test("sortByLabel: standard letter sizes sort smallest to largest", () => {
  const input = ["L", "XS", "M", "S", "XL"];
  assert.deepEqual(sortByLabel(input, (x) => x), ["XS", "S", "M", "L", "XL"]);
});

test("sortByLabel: extended letter sizes sort after standard ones", () => {
  const input = ["XXL", "M", "XXXS", "4XL", "S"];
  assert.deepEqual(sortByLabel(input, (x) => x), ["XXXS", "S", "M", "XXL", "4XL"]);
});

test("sortByLabel: numeric sizes sort ascending, after letter sizes", () => {
  const input = ["40", "36", "L", "38", "S"];
  assert.deepEqual(sortByLabel(input, (x) => x), ["S", "L", "36", "38", "40"]);
});

test("sortByLabel: EU shoe sizes sort numerically", () => {
  const input = ["EU 42", "EU 38", "EU 40"];
  assert.deepEqual(sortByLabel(input, (x) => x), ["EU 38", "EU 40", "EU 42"]);
});

test("sortByLabel: unrecognized labels keep their original relative order, at the end", () => {
  const input = ["One Size", "M", "6-12 Months", "S"];
  assert.deepEqual(sortByLabel(input, (x) => x), ["S", "M", "One Size", "6-12 Months"]);
});

test("sortByLabel: is case-insensitive on letter sizes", () => {
  const input = ["l", "xs", "M"];
  assert.deepEqual(sortByLabel(input, (x) => x), ["xs", "M", "l"]);
});

test("compareSizeLabels: sorts objects by a derived label, not just strings", () => {
  const items = [{ label: "L" }, { label: "XS" }, { label: "M" }];
  const sorted = sortByLabel(items, (item) => item.label);
  assert.deepEqual(sorted.map((i) => i.label), ["XS", "M", "L"]);
  assert.equal(compareSizeLabels("XS", "L") < 0, true);
});

// ── Custom (brand-defined) size ordering ────────────────────────────────
// Reproduces the exact walkthrough given for this feature: XS/S/M/L are
// recognized and always internally sorted; a custom size can only ever
// land before or after that whole block, never inside it.

function labels(items: SizeOrderable[]): string[] {
  return sortSizeOrderables(items).map((i) => i.label);
}

function applyMove(items: SizeOrderable[], id: string, direction: "up" | "down"): SizeOrderable[] {
  const moves = reorderCustomSize(items, id, direction);
  assert.notEqual(moves, null, `expected a move to be possible for ${id} (${direction})`);
  const byId = new Map(moves!.map((m) => [m.id, m.sortOrder]));
  return items.map((item) => (byId.has(item.id) ? { ...item, sortOrder: byId.get(item.id) } : item));
}

test("custom sizes: a brand-new custom size defaults to the very end", () => {
  const known: SizeOrderable[] = [
    { id: "xs", label: "XS" },
    { id: "s", label: "S" },
    { id: "m", label: "M" },
    { id: "l", label: "L" },
  ];
  const sm: SizeOrderable = { id: "sm", label: "S/M", sortOrder: nextAfterZoneSortOrder([]) };
  assert.equal(sm.sortOrder, CUSTOM_AFTER_ZONE_BASE);
  assert.deepEqual(labels([...known, sm]), ["XS", "S", "M", "L", "S/M"]);
});

test("custom sizes: moving up from the after-zone crosses to the very front, never between recognized sizes", () => {
  const known: SizeOrderable[] = [
    { id: "xs", label: "XS" },
    { id: "s", label: "S" },
    { id: "m", label: "M" },
    { id: "l", label: "L" },
  ];
  const sm: SizeOrderable = { id: "sm", label: "S/M", sortOrder: CUSTOM_AFTER_ZONE_BASE };
  const afterMove = applyMove([...known, sm], "sm", "up");
  assert.deepEqual(labels(afterMove), ["S/M", "XS", "S", "M", "L"]);
});

test("custom sizes: a newly-added recognized size (XL) always slots into the recognized block, never disturbs a custom size's zone", () => {
  const list: SizeOrderable[] = [
    { id: "xs", label: "XS" },
    { id: "s", label: "S" },
    { id: "m", label: "M" },
    { id: "l", label: "L" },
    { id: "sm", label: "S/M", sortOrder: CUSTOM_AFTER_ZONE_BASE },
    { id: "xl", label: "XL" },
  ];
  assert.deepEqual(labels(list), ["XS", "S", "M", "L", "XL", "S/M"]);
});

test("custom sizes: full walkthrough — S/M then XL then M/L, reordering M/L up twice", () => {
  const xs: SizeOrderable = { id: "xs", label: "XS" };
  const s: SizeOrderable = { id: "s", label: "S" };
  const m: SizeOrderable = { id: "m", label: "M" };
  const l: SizeOrderable = { id: "l", label: "L" };
  const xl: SizeOrderable = { id: "xl", label: "XL" };
  const sm: SizeOrderable = { id: "sm", label: "S/M", sortOrder: nextAfterZoneSortOrder([]) };
  let list = [xs, s, m, l, xl, sm];
  assert.deepEqual(labels(list), ["XS", "S", "M", "L", "XL", "S/M"]);

  const ml: SizeOrderable = {
    id: "ml",
    label: "M/L",
    sortOrder: nextAfterZoneSortOrder(list.map((i) => i.sortOrder)),
  };
  list = [...list, ml];
  assert.deepEqual(labels(list), ["XS", "S", "M", "L", "XL", "S/M", "M/L"]);

  // First "up" on M/L: swaps with S/M within the after-zone.
  list = applyMove(list, "ml", "up");
  assert.deepEqual(labels(list), ["XS", "S", "M", "L", "XL", "M/L", "S/M"]);

  // Second "up" on M/L: now frontmost in the after-zone, crosses to the
  // very front — S/M is untouched, still right after the recognized block.
  list = applyMove(list, "ml", "up");
  assert.deepEqual(labels(list), ["M/L", "XS", "S", "M", "L", "XL", "S/M"]);
});

test("custom sizes: a recognized size can never be manually reordered", () => {
  const list: SizeOrderable[] = [
    { id: "xs", label: "XS" },
    { id: "s", label: "S" },
  ];
  assert.equal(reorderCustomSize(list, "xs", "up"), null);
  assert.equal(reorderCustomSize(list, "s", "down"), null);
});

test("custom sizes: can't move past the extreme edge of its own zone", () => {
  const list: SizeOrderable[] = [
    { id: "xs", label: "XS" },
    { id: "sm", label: "S/M", sortOrder: -1 },
  ];
  // Already frontmost in the before-zone — "up" is a no-op.
  assert.equal(reorderCustomSize(list, "sm", "up"), null);
});

// Regression: a shared/system size whose label this file's text patterns
// don't recognize ("One Size", age ranges, ...) must NOT be treated as
// custom just because it fails the regex — it has brand_id null and its
// own real, already-correct sort_order. Reordering an actual custom size
// must never touch it or drag it into the custom zone.
test("custom sizes: a shared value with an unrecognized label (brandId null) is never treated as custom", () => {
  const oneSize: SizeOrderable = { id: "one-size", label: "One Size", sortOrder: 20, brandId: null };
  const months: SizeOrderable = { id: "months", label: "3–6 Months", sortOrder: 82, brandId: null };
  const sm: SizeOrderable = { id: "sm", label: "S/M", sortOrder: 0, brandId: "brand-1" };
  const ml: SizeOrderable = { id: "ml", label: "M/L", sortOrder: 0, brandId: "brand-1" };
  const list = [oneSize, months, sm, ml];

  // Both unrecognized-by-label shared sizes keep their own DB order,
  // undisturbed by the two untouched (sort_order 0) customs sitting in
  // the old stable "not yet zoned" fallback right after them.
  assert.deepEqual(labels(list), ["One Size", "3–6 Months", "S/M", "M/L"]);

  const moves = reorderCustomSize(list, "sm", "up");
  assert.notEqual(moves, null);
  const movedIds = new Set(moves!.map((m) => m.id));
  // Only the actual customs (S/M, M/L) may be in the move set — One Size
  // and the age range must be completely absent from it.
  assert.equal(movedIds.has("one-size"), false);
  assert.equal(movedIds.has("months"), false);
  assert.equal(movedIds.has("sm"), true);
});
