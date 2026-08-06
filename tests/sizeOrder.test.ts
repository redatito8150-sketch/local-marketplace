import assert from "node:assert/strict";
import test from "node:test";
import { compareSizeLabels, sortByLabel } from "../lib/inventory/sizeOrder.ts";

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
