import assert from "node:assert/strict";
import test from "node:test";
import { validateProductInput, type ProductInput } from "../lib/admin/productValidation.ts";
import { validateBrandInput, type BrandInput } from "../lib/admin/brandValidation.ts";

const baseVariant = { optionValueIds: [], quantity: 1, sellingStatus: "active" as const };

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
  variants: [baseVariant],
  colorImages: {},
};

test("validateProductInput accepts a fully complete draft submission", () => {
  const result = validateProductInput(baseProduct);
  assert.equal(result, null);
});

test("validateProductInput rejects a missing brand, even as a draft", () => {
  const result = validateProductInput({ ...baseProduct, brandId: "" });
  assert.equal(result, "A brand must be selected");
});

test("validateProductInput rejects a missing audience, even as a draft", () => {
  // @ts-expect-error -- deliberately invalid to exercise the rejection path
  const result = validateProductInput({ ...baseProduct, audience: "" });
  assert.equal(result, "Audience must be selected");
});

test("validateProductInput rejects an invalid audience value", () => {
  // @ts-expect-error -- deliberately invalid to exercise the rejection path
  const result = validateProductInput({ ...baseProduct, audience: "other" });
  assert.equal(result, "Audience must be selected");
});

test("validateProductInput accepts each of the 4 real audiences", () => {
  for (const audience of ["men", "women", "unisex", "kids_baby"] as const) {
    const result = validateProductInput({ ...baseProduct, audience });
    assert.equal(result, null);
  }
});

test("validateProductInput rejects a missing taxonomy selection, even as a draft", () => {
  const result = validateProductInput({ ...baseProduct, productTypeId: "" });
  assert.equal(
    result,
    "A complete Main Category / Product Group / Product Type selection is required"
  );
});

// Publishing no longer requires positive stock — catalog information only
// is entered here, for direct and partner brands alike. A quantity-0
// variant publishes fine as long as it's Active; only "everything paused/
// discontinued" actually blocks publishing.
test("validateProductInput requires an Active variant, not stock, before publishing", () => {
  const result = validateProductInput({
    ...baseProduct,
    status: "published",
    variants: [{ ...baseVariant, quantity: 0, sellingStatus: "paused" }],
  });
  assert.equal(result, "At least one variant needs an Active Selling Status before publishing");
});

test("validateProductInput accepts a fully complete publish submission with zero stock", () => {
  const result = validateProductInput({
    ...baseProduct,
    status: "published",
    variants: [{ ...baseVariant, quantity: 0 }],
  });
  assert.equal(result, null);
});

const baseBrand: BrandInput = {
  slug: "nola",
  name: "Nola",
  tagline: "Everyday essentials",
  category: "Clothing",
  skuPrefix: "NOLA",
  city: "Cairo",
  heroImage: "/hero.jpg",
  aboutDescription: "About",
  aboutImage: "/about.jpg",
  storyBody: "Story",
};

test("validateBrandInput accepts a valid SKU prefix", () => {
  assert.equal(validateBrandInput(baseBrand), null);
  assert.equal(validateBrandInput({ ...baseBrand, skuPrefix: "N1" }), null);
});

test("validateBrandInput rejects a missing SKU prefix", () => {
  assert.equal(
    validateBrandInput({ ...baseBrand, skuPrefix: "" }),
    "SKU Prefix is required and must be 2–6 uppercase letters/numbers"
  );
});

test("validateBrandInput rejects a malformed SKU prefix", () => {
  assert.equal(validateBrandInput({ ...baseBrand, skuPrefix: "n" }), "SKU Prefix is required and must be 2–6 uppercase letters/numbers");
  assert.equal(validateBrandInput({ ...baseBrand, skuPrefix: "TOO-LONG-PREFIX" }), "SKU Prefix is required and must be 2–6 uppercase letters/numbers");
  assert.equal(validateBrandInput({ ...baseBrand, skuPrefix: "no-caps" }), "SKU Prefix is required and must be 2–6 uppercase letters/numbers");
});
