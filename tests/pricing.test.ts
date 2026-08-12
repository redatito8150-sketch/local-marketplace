import test from "node:test";
import assert from "node:assert/strict";
import { discountSavings, getEffectivePrice, getVariantEffectivePrice, isDiscountActive } from "../lib/pricing.ts";

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

// getVariantEffectivePrice's base/source/percent fields are the point-in-time
// pricing snapshot every order-creation path stores on order_items — see
// supabase/migrations/20260813000002_order_pricing_snapshots.sql.

test("no discount: base equals price, source is 'none'", () => {
  const result = getVariantEffectivePrice(500, undefined, null, null, null);
  assert.equal(result.price, 500);
  assert.equal(result.base, 500);
  assert.equal(result.source, "none");
  assert.equal(result.active, false);
});

test("product-level discount: base is the pre-discount product price, source is 'product_discount'", () => {
  const result = getVariantEffectivePrice(500, undefined, 20, null, null);
  assert.equal(result.price, 400);
  assert.equal(result.base, 500);
  assert.equal(result.percent, 20);
  assert.equal(result.source, "product_discount");
});

test("variant-level discount: base is the variant's own price, source is 'variant_discount', wins over a product discount", () => {
  const result = getVariantEffectivePrice(500, 600, 20, null, 50);
  assert.equal(result.price, 300); // 600 * (1 - 0.50)
  assert.equal(result.base, 600);
  assert.equal(result.percent, 50);
  assert.equal(result.source, "variant_discount");
});

test("a discount expired before checkout: base still reflects the (now-inactive) product price, source is 'none'", () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const result = getVariantEffectivePrice(500, undefined, 20, past, null);
  assert.equal(result.price, 500);
  assert.equal(result.base, 500);
  assert.equal(result.active, false);
  assert.equal(result.source, "none");
});
