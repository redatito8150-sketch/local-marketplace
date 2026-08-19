import assert from "node:assert/strict";
import test from "node:test";
import { getProductPricePresentation } from "../lib/products/pricingPresentation.ts";

const now = new Date("2026-08-19T12:00:00.000Z");

test("shows the live discounted product price instead of the permanent base price", () => {
  assert.deepEqual(getProductPricePresentation({ price: 1000, discountPercent: 8 }, now), {
    currentMin: 920,
    currentMax: 920,
    originalMin: 1000,
    originalMax: 1000,
    hasDiscount: true,
    discountLabel: "8% off",
  });
});

test("builds a live price range from active Variants", () => {
  const pricing = getProductPricePresentation({
    price: 1000,
    discountPercent: 8,
    variants: [
      { sellingStatus: "active" },
      { sellingStatus: "active", variantPrice: 1200 },
      { sellingStatus: "paused", variantPrice: 5000 },
    ],
  }, now);

  assert.equal(pricing.currentMin, 920);
  assert.equal(pricing.currentMax, 1104);
  assert.equal(pricing.originalMin, 1000);
  assert.equal(pricing.originalMax, 1200);
});

test("summarizes per-Variant markdowns without claiming one universal discount", () => {
  const pricing = getProductPricePresentation({
    price: 1000,
    variants: [
      { sellingStatus: "active", variantDiscountPercent: 10 },
      { sellingStatus: "active", variantPrice: 1200 },
    ],
  }, now);

  assert.equal(pricing.currentMin, 900);
  assert.equal(pricing.currentMax, 1200);
  assert.equal(pricing.discountLabel, "Up to 10% off");
});

