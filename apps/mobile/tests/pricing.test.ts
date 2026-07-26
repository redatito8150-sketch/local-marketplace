import assert from "node:assert/strict";
import test from "node:test";
import { calculateDiscountPercent, formatPrice } from "../src/domain/pricing.ts";

test("price formatting respects EGP and USD precision", () => {
  assert.match(formatPrice(1250, "EGP"), /1,250/);
  assert.match(formatPrice(12.5, "USD"), /12\.50/);
});

test("discount formatting only accepts a higher original price", () => {
  assert.equal(calculateDiscountPercent(800, 1000), 20);
  assert.equal(calculateDiscountPercent(1000, 800), 0);
  assert.equal(calculateDiscountPercent(1000, null), 0);
});
