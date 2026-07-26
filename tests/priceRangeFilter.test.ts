import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PRICE_BOUNDS,
  derivePriceBounds,
  encodePriceRangeValue,
  parsePriceRangeValue,
} from "../lib/filters.ts";

test("derivePriceBounds computes the real min/max from product prices", () => {
  assert.deepEqual(derivePriceBounds([{ price: 1250.4 }, { price: 300 }, { price: 899.9 }]), {
    min: 300,
    max: 1251,
  });
});

test("derivePriceBounds falls back to the configured default bounds for an empty catalog", () => {
  assert.deepEqual(derivePriceBounds([]), DEFAULT_PRICE_BOUNDS);
});

test("derivePriceBounds ignores non-finite prices", () => {
  assert.deepEqual(derivePriceBounds([{ price: NaN }, { price: 500 }]), { min: 500, max: 500 });
});

test("encodePriceRangeValue and parsePriceRangeValue round-trip a range", () => {
  const encoded = encodePriceRangeValue(150.6, 2000.2);
  assert.equal(encoded, "151-2000");
  assert.deepEqual(parsePriceRangeValue(encoded), { min: 151, max: 2000 });
});

test("parsePriceRangeValue rejects malformed or inverted values", () => {
  assert.equal(parsePriceRangeValue(undefined), null);
  assert.equal(parsePriceRangeValue(""), null);
  assert.equal(parsePriceRangeValue("not-a-range"), null);
  assert.equal(parsePriceRangeValue("2000-500"), null);
});

test("parsePriceRangeValue accepts an equal min and max", () => {
  assert.deepEqual(parsePriceRangeValue("500-500"), { min: 500, max: 500 });
});
