import assert from "node:assert/strict";
import test from "node:test";
import { formatPrice, getEffectivePrice, isDiscountActive } from "../src/domain/pricing.ts";

test("price formatting respects EGP and USD precision", () => {
  assert.match(formatPrice(1250, "EGP"), /1,250/);
  assert.match(formatPrice(12.5, "USD"), /12\.50/);
});

test("time-bound discounts expire deterministically", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");
  assert.equal(isDiscountActive(20, null, now), true);
  assert.equal(isDiscountActive(20, "2026-08-10T11:59:59.000Z", now), false);
  assert.equal(getEffectivePrice(1000, 20, "2026-08-10T13:00:00.000Z", now), 800);
  assert.equal(getEffectivePrice(1000, 20, "2026-08-10T11:00:00.000Z", now), 1000);
});
