import test from "node:test";
import assert from "node:assert/strict";
import { discountSavings, getEffectivePrice, isDiscountActive } from "../lib/pricing.ts";

test("a discount with no end date runs forever", () => {
  assert.equal(isDiscountActive(10, undefined), true);
  assert.equal(getEffectivePrice(100, 10, undefined), 90);
});

test("a discount is active before its end time and inactive after", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal(isDiscountActive(10, future), true);
  assert.equal(isDiscountActive(10, past), false);
  assert.equal(getEffectivePrice(100, 10, future), 90);
  assert.equal(getEffectivePrice(100, 10, past), 100);
});

test("no discount percent means the base price always applies", () => {
  assert.equal(isDiscountActive(undefined, undefined), false);
  assert.equal(isDiscountActive(0, undefined), false);
  assert.equal(getEffectivePrice(100, undefined, undefined), 100);
});

test("savings is the exact difference between base and effective price", () => {
  assert.equal(discountSavings(110, 10), 11);
  assert.equal(discountSavings(100, undefined), 0);
});
