import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateStockStatus,
  effectiveLowStockThreshold,
  isVariantPurchasable,
} from "../lib/inventory/stockStatus.ts";
import {
  MAX_VARIANT_OPTIONS_PER_PRODUCT,
  MAX_VARIANTS_PER_PRODUCT,
  buildComboKey,
  calculateVariantCombinationCount,
  generateVariantCombinations,
} from "../lib/inventory/variantCombinations.ts";
import { buildVariantSkuBase, buildVariantSkuWithSuffix } from "../lib/inventory/variantSku.ts";
import { calculateTotalInventory, calculateVariantReadiness } from "../lib/inventory/readiness.ts";
import { validateProductInput, type ProductInput } from "../lib/admin/productValidation.ts";

// ── Stock Status ─────────────────────────────────────────────────────────

test("calculateStockStatus: 0 or negative is always out of stock", () => {
  assert.equal(calculateStockStatus(0, 5), "out_of_stock");
  assert.equal(calculateStockStatus(-1, 5), "out_of_stock");
});

test("calculateStockStatus: at or below threshold (but > 0) is low stock", () => {
  assert.equal(calculateStockStatus(5, 5), "low_stock");
  assert.equal(calculateStockStatus(1, 5), "low_stock");
});

test("calculateStockStatus: above threshold is in stock", () => {
  assert.equal(calculateStockStatus(6, 5), "in_stock");
});

test("effectiveLowStockThreshold: override wins when present, including 0", () => {
  assert.equal(effectiveLowStockThreshold(2, 5), 2);
  assert.equal(effectiveLowStockThreshold(0, 5), 0);
  assert.equal(effectiveLowStockThreshold(null, 5), 5);
  assert.equal(effectiveLowStockThreshold(undefined, 5), 5);
});

test("isVariantPurchasable: requires active, in-stock, non-archived, and (if known) a published product", () => {
  assert.equal(
    isVariantPurchasable({ sellingStatus: "active", quantity: 1, isArchived: false }),
    true
  );
  assert.equal(
    isVariantPurchasable({ sellingStatus: "paused", quantity: 1, isArchived: false }),
    false
  );
  assert.equal(
    isVariantPurchasable({ sellingStatus: "active", quantity: 0, isArchived: false }),
    false
  );
  assert.equal(
    isVariantPurchasable({ sellingStatus: "active", quantity: 1, isArchived: true }),
    false
  );
  assert.equal(
    isVariantPurchasable({
      sellingStatus: "active",
      quantity: 1,
      isArchived: false,
      productStatus: "draft",
    }),
    false
  );
  assert.equal(
    isVariantPurchasable({
      sellingStatus: "active",
      quantity: 1,
      isArchived: false,
      pausedByBrand: true,
    }),
    false
  );
});

// ── Variant combination generation ──────────────────────────────────────

test("buildComboKey is order-independent and empty for no options", () => {
  assert.equal(buildComboKey(["b", "a"]), buildComboKey(["a", "b"]));
  assert.equal(buildComboKey([]), "");
});

test("calculateVariantCombinationCount multiplies value counts across options", () => {
  assert.equal(
    calculateVariantCombinationCount([
      { optionTypeId: "color", valueIds: ["red", "blue"] },
      { optionTypeId: "size", valueIds: ["s", "m", "l"] },
    ]),
    6
  );
  assert.equal(calculateVariantCombinationCount([]), 1);
});

test("generateVariantCombinations produces one default variant with no options selected", () => {
  const result = generateVariantCombinations([]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.combinations, [{ optionValueIds: [], comboKey: "" }]);
  }
});

test("generateVariantCombinations produces the full Cartesian product for 1-3 options", () => {
  const result = generateVariantCombinations([
    { optionTypeId: "color", valueIds: ["red", "blue"] },
    { optionTypeId: "size", valueIds: ["s", "m"] },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.combinations.length, 4);
    const comboKeys = new Set(result.combinations.map((c) => c.comboKey));
    assert.equal(comboKeys.size, 4);
  }
});

test("generateVariantCombinations rejects a 4th option type", () => {
  const result = generateVariantCombinations([
    { optionTypeId: "a", valueIds: ["1"] },
    { optionTypeId: "b", valueIds: ["1"] },
    { optionTypeId: "c", valueIds: ["1"] },
    { optionTypeId: "d", valueIds: ["1"] },
  ]);
  assert.equal(result.ok, false);
  assert.equal(MAX_VARIANT_OPTIONS_PER_PRODUCT, 3);
});

test("generateVariantCombinations rejects a selection exceeding the 200-variant cap", () => {
  const result = generateVariantCombinations([
    { optionTypeId: "color", valueIds: Array.from({ length: 15 }, (_, i) => `c${i}`) },
    { optionTypeId: "size", valueIds: Array.from({ length: 15 }, (_, i) => `s${i}`) },
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.total, 225);
  assert.equal(MAX_VARIANTS_PER_PRODUCT, 200);
});

test("generateVariantCombinations rejects an option selected with zero values", () => {
  const result = generateVariantCombinations([{ optionTypeId: "color", valueIds: [] }]);
  assert.equal(result.ok, false);
});

// ── Variant SKU generation ──────────────────────────────────────────────

test("buildVariantSkuBase appends tokens in the given order, or falls back to the bare product SKU", () => {
  assert.equal(buildVariantSkuBase("NOLA-1", ["RED", "M"]), "NOLA-1-RED-M");
  assert.equal(buildVariantSkuBase("NOLA-1", []), "NOLA-1");
});

test("buildVariantSkuWithSuffix only appends a suffix on retry attempts", () => {
  assert.equal(buildVariantSkuWithSuffix("NOLA-1-RED-M", 0), "NOLA-1-RED-M");
  assert.equal(buildVariantSkuWithSuffix("NOLA-1-RED-M", 1), "NOLA-1-RED-M-2");
  assert.equal(buildVariantSkuWithSuffix("NOLA-1-RED-M", 2), "NOLA-1-RED-M-3");
});

// ── Readiness / Total Inventory ─────────────────────────────────────────

test("calculateTotalInventory sums only non-archived variants", () => {
  assert.equal(
    calculateTotalInventory([
      { quantity: 3, sellingStatus: "active", isArchived: false },
      { quantity: 2, sellingStatus: "active", isArchived: false },
      { quantity: 100, sellingStatus: "active", isArchived: true },
    ]),
    5
  );
});

test("calculateVariantReadiness reports every required signal", () => {
  const readiness = calculateVariantReadiness(
    [
      { quantity: 0, sellingStatus: "active", isArchived: false },
      { quantity: 5, sellingStatus: "active", isArchived: false },
    ],
    "published"
  );
  assert.equal(readiness.hasAtLeastOneVariant, true);
  assert.equal(readiness.hasActivePurchasableVariant, true);
  assert.equal(readiness.hasValidInventory, true);
  assert.equal(readiness.hasValidVariantCombinations, true);
});

test("calculateVariantReadiness reports no purchasable variant when every variant is paused or out of stock", () => {
  const readiness = calculateVariantReadiness(
    [
      { quantity: 0, sellingStatus: "active", isArchived: false },
      { quantity: 5, sellingStatus: "paused", isArchived: false },
    ],
    "published"
  );
  assert.equal(readiness.hasActivePurchasableVariant, false);
});

// ── Product-level validation: options/variants integration ─────────────

const baseProduct: ProductInput = {
  name: "Test Product",
  brandId: "brand-1",
  productTypeId: "leaf-1",
  audience: "unisex",
  price: 500,
  currency: "EGP",
  image: "/x.jpg",
  description: "A product",
  details: [],
  careInstructions: [],
  shippingReturns: "",
  isNew: false,
  featured: false,
  status: "draft",
  defaultLowStockThreshold: 5,
  optionTypeIds: [],
  valueIdsByOptionType: {},
  variants: [{ optionValueIds: [], quantity: 1, sellingStatus: "active" }],
  colorImages: {},
};

test("validateProductInput rejects more than 3 option types", () => {
  const result = validateProductInput({
    ...baseProduct,
    optionTypeIds: ["a", "b", "c", "d"],
    valueIdsByOptionType: { a: ["1"], b: ["1"], c: ["1"], d: ["1"] },
  });
  assert.equal(result, "A product can have a maximum of 3 variant options.");
});

test("validateProductInput rejects a variant quantity that is negative or non-integer", () => {
  const negative = validateProductInput({
    ...baseProduct,
    variants: [{ optionValueIds: [], quantity: -1, sellingStatus: "active" }],
  });
  assert.equal(negative, "Each variant needs a whole, non-negative quantity");

  const fractional = validateProductInput({
    ...baseProduct,
    variants: [{ optionValueIds: [], quantity: 1.5, sellingStatus: "active" }],
  });
  assert.equal(fractional, "Each variant needs a whole, non-negative quantity");
});

test("validateProductInput rejects duplicate variant combinations", () => {
  const result = validateProductInput({
    ...baseProduct,
    variants: [
      { optionValueIds: ["red", "m"], quantity: 1, sellingStatus: "active" },
      { optionValueIds: ["m", "red"], quantity: 1, sellingStatus: "active" },
    ],
  });
  assert.equal(result, "Duplicate variant combination detected");
});

test("validateProductInput requires an active, in-stock variant before publishing", () => {
  const paused = validateProductInput({
    ...baseProduct,
    status: "published",
    variants: [{ optionValueIds: [], quantity: 5, sellingStatus: "paused" }],
  });
  assert.equal(paused, "At least one variant needs stock and an Active Selling Status before publishing");

  const ok = validateProductInput({
    ...baseProduct,
    status: "published",
    variants: [{ optionValueIds: [], quantity: 5, sellingStatus: "active" }],
  });
  assert.equal(ok, null);
});
