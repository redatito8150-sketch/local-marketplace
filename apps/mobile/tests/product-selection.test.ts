import assert from "node:assert/strict";
import test from "node:test";
import { findProductVariant, isProductSelectionUnavailable, resolveProductPrice } from "../src/domain/product-selection.ts";

const variants = [
  { size: "M", color: "Black", price_override: 950 },
  { size: "L", color: "Ivory", price_override: null },
];

test("variant selection normalizes customer input", () => {
  assert.equal(findProductVariant(variants, " m ", "black"), variants[0]);
  assert.equal(findProductVariant(variants, "S", "Black"), undefined);
});

test("active price uses a real override, including zero, before product price", () => {
  assert.equal(resolveProductPrice({ price: 1200 }, variants[0]), 950);
  assert.equal(resolveProductPrice({ price: 1200 }, variants[1]), 1200);
  assert.equal(resolveProductPrice({ price: 1200 }, { size: null, color: null, price_override: 0 }), 0);
});

test("stock rules reject missing, unavailable, and depleted variants", () => {
  assert.equal(isProductSelectionUnavailable({ hasVariants: true, selectedVariant: undefined, tracksInventory: true, selectedSize: "M", unavailableSizes: [] }), true);
  assert.equal(isProductSelectionUnavailable({ hasVariants: true, selectedVariant: { size: "M", color: "Black", price_override: null, availability_status: "available", quantity: 0 }, tracksInventory: true, selectedSize: "M", unavailableSizes: [] }), true);
  assert.equal(isProductSelectionUnavailable({ hasVariants: true, selectedVariant: { size: "M", color: "Black", price_override: null, availability_status: "available", quantity: 4 }, tracksInventory: true, selectedSize: "M", unavailableSizes: [] }), false);
});
