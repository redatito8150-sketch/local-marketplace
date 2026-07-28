import assert from "node:assert/strict";
import test from "node:test";
import { findProductVariant, isProductSelectionUnavailable, resolveProductPrice } from "../src/domain/product-selection.ts";

const variants = [
  { optionValues: [{ optionTypeName: "Size", label: "M" }, { optionTypeName: "Color", label: "Black" }], variant_price: 950 },
  { optionValues: [{ optionTypeName: "Size", label: "L" }, { optionTypeName: "Color", label: "Ivory" }], variant_price: null },
];

test("variant selection normalizes customer input", () => {
  assert.equal(findProductVariant(variants, " m ", "black"), variants[0]);
  assert.equal(findProductVariant(variants, "S", "Black"), undefined);
});

test("active price uses a real override, including zero, before product price", () => {
  assert.equal(resolveProductPrice({ price: 1200 }, variants[0]), 950);
  assert.equal(resolveProductPrice({ price: 1200 }, variants[1]), 1200);
  assert.equal(resolveProductPrice({ price: 1200 }, { optionValues: [], variant_price: 0 }), 0);
});

test("stock rules reject missing, unavailable, and depleted variants", () => {
  assert.equal(isProductSelectionUnavailable({ hasVariants: true, selectedVariant: undefined, selectedSize: "M", unavailableSizes: [] }), true);
  assert.equal(isProductSelectionUnavailable({ hasVariants: true, selectedVariant: { optionValues: [], variant_price: null, selling_status: "active", quantity: 0 }, selectedSize: "M", unavailableSizes: [] }), true);
  assert.equal(isProductSelectionUnavailable({ hasVariants: true, selectedVariant: { optionValues: [], variant_price: null, selling_status: "active", quantity: 4 }, selectedSize: "M", unavailableSizes: [] }), false);
});
