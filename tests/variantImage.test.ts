import test from "node:test";
import assert from "node:assert/strict";
import { buildColorImageLookup, resolveVariantImage } from "../lib/orders/variantImage.ts";

const variant = {
  optionValues: [
    { optionTypeId: "color", optionTypeName: "Color", optionValueId: "blue", label: "Blue" },
    { optionTypeId: "size", optionTypeName: "Size", optionValueId: "m", label: "M" },
  ],
};

test("resolveVariantImage prefers the exact selected color image", () => {
  const lookup = buildColorImageLookup([
    { product_id: "p1", storage_reference: "blue-first.jpg", color_option_value_id: "blue" },
    { product_id: "p1", storage_reference: "blue-second.jpg", color_option_value_id: "blue" },
  ]);
  assert.equal(resolveVariantImage("p1", variant, lookup, "cover.jpg"), "blue-first.jpg");
});

test("resolveVariantImage falls back to the historical snapshot or product cover", () => {
  assert.equal(resolveVariantImage("p1", variant, new Map(), "snapshot.jpg"), "snapshot.jpg");
  assert.equal(resolveVariantImage("p1", variant, new Map(), null), "");
});
