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
import { reconcileAllowedCombinationPool, validateAllowedCombinations, variantChangeSummary } from "../lib/inventory/allowedCombinations.ts";
import { profileForSizeLabel, recommendedSizeProfiles } from "../lib/inventory/sizeProfiles.ts";

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
      productStatus: "paused",
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

test("allowed combinations generate only explicit matrix cells", () => {
  const result = validateAllowedCombinations(
    ["color", "size"],
    { color: ["red", "white"], size: ["s", "m", "44", "46"] },
    [["red", "s"], ["red", "m"], ["white", "44"], ["white", "46"]]
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.combinations.length, 4);
    assert.equal(result.combinations.some((combination) => combination.comboKey === buildComboKey(["red", "44"])), false);
    assert.equal(result.combinations.some((combination) => combination.comboKey === buildComboKey(["white", "s"])), false);
  }
});

test("allowed combinations reject zero, incomplete, duplicate, and over-200 sets", () => {
  assert.equal(validateAllowedCombinations(["color"], { color: ["red"] }, []).ok, false);
  assert.equal(validateAllowedCombinations(["color", "size"], { color: ["red"], size: ["s"] }, [["red"]]).ok, false);
  assert.equal(validateAllowedCombinations(["color"], { color: ["red"] }, [["red"], ["red"]]).ok, false);
  assert.equal(validateAllowedCombinations(["size"], { size: Array.from({ length: 201 }, (_, i) => String(i)) }, Array.from({ length: 201 }, (_, i) => [String(i)])).ok, false);
});

test("new option values remain unselected and removed values prune only invalid combinations", () => {
  const current = [["red", "s"]];
  assert.deepEqual(reconcileAllowedCombinationPool(current, { color: ["red", "white"], size: ["s", "m"] }), current);
  assert.deepEqual(reconcileAllowedCombinationPool(current, { color: ["white"], size: ["s"] }), []);
});

test("variant change summary preserves matching combinations and inventory", () => {
  const summary = variantChangeSummary(
    [{ optionValueIds: ["red", "s"], quantity: 10 }, { optionValueIds: ["red", "m"], quantity: 10 }],
    [["red", "s"], ["red", "m"], ["white", "44"], ["white", "46"]]
  );
  assert.deepEqual(summary, { preserved: 2, created: 2, removed: 0, affectedQuantity: 0 });
});

test("taxonomy-aware Size profiles prioritize apparel, trousers, shoes, and baby signals", () => {
  const nodes = [
    { id: "clothing", parentId: null, level: 1, name: "Clothing", slug: "clothing", sortOrder: 1, isActive: true },
    { id: "tops", parentId: "clothing", level: 2, name: "Tops", slug: "tops", sortOrder: 1, isActive: true },
    { id: "shirts", parentId: "tops", level: 3, name: "T-Shirts", slug: "t-shirts", sortOrder: 1, isActive: true },
    { id: "trousers", parentId: "clothing", level: 3, name: "Trousers", slug: "trousers", sortOrder: 2, isActive: true },
    { id: "shoes", parentId: null, level: 1, name: "Shoes", slug: "shoes", sortOrder: 2, isActive: true },
    { id: "sneakers", parentId: "shoes", level: 3, name: "Sneakers", slug: "sneakers", sortOrder: 1, isActive: true },
    { id: "kids", parentId: null, level: 1, name: "Kids & Baby", slug: "kids", sortOrder: 3, isActive: true },
    { id: "baby", parentId: "kids", level: 3, name: "Baby Bodysuits", slug: "baby", sortOrder: 1, isActive: true },
  ] as any;
  assert.ok(recommendedSizeProfiles(nodes, "shirts").includes("standard-apparel"));
  assert.ok(recommendedSizeProfiles(nodes, "trousers").includes("waist-numeric"));
  assert.deepEqual(recommendedSizeProfiles(nodes, "sneakers"), ["eu-shoes"]);
  assert.deepEqual(recommendedSizeProfiles(nodes, "baby"), ["baby-age"]);
  assert.equal(profileForSizeLabel("EU 42"), "eu-shoes");
  assert.equal(profileForSizeLabel("0–3 Months"), "baby-age");
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
  launchPolicy: "show_now",
  defaultLowStockThreshold: 5,
  optionTypeIds: [],
  valueIdsByOptionType: {},
  allowedCombinations: [[]],
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

// Product creation/editing is catalog-only now — publishing no longer
// requires positive stock for anyone (direct or partner). Only an Active
// variant definition is required; the actual sellable-stock gap closes
// later through Inventory, never this form.
test("validateProductInput requires an active variant before publishing (quantity is never the gate)", () => {
  const paused = validateProductInput({
    ...baseProduct,
    status: "published",
    variants: [{ optionValueIds: [], quantity: 0, sellingStatus: "paused" }],
  });
  assert.equal(paused, "At least one variant needs an Active Selling Status before publishing");

  const okWithStock = validateProductInput({
    ...baseProduct,
    status: "published",
    variants: [{ optionValueIds: [], quantity: 5, sellingStatus: "active" }],
  });
  assert.equal(okWithStock, null);

  const okWithoutStock = validateProductInput({
    ...baseProduct,
    status: "published",
    variants: [{ optionValueIds: [], quantity: 0, sellingStatus: "active" }],
  });
  assert.equal(okWithoutStock, null);
});
