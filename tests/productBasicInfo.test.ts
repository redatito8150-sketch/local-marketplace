import assert from "node:assert/strict";
import test from "node:test";
import { validateProductInput, type ProductInput } from "../lib/admin/productValidation.ts";
import { deriveCategoryFromAudience } from "../lib/admin/productPersistence.ts";
import { validateBrandInput, type BrandInput } from "../lib/admin/brandValidation.ts";

const baseVariant = { quantity: 1, lowStockThreshold: 1, availabilityStatus: "available" as const };

const draftProduct: ProductInput = {
  name: "Test Product",
  brandName: "Nola",
  productCategory: "Clothing",
  productType: "T-Shirts",
  price: 500,
  currency: "EGP",
  image: "/x.jpg",
  colors: [],
  sizes: ["M"],
  description: "A product",
  details: [],
  careInstructions: [],
  shippingReturns: "",
  isNew: false,
  isUnisex: false,
  trackInventory: true,
  featured: false,
  status: "draft",
  variants: [baseVariant],
};

test("validateProductInput allows a draft with no audience/brand/taxonomy leaf", () => {
  const result = validateProductInput(draftProduct);
  assert.equal(result, null);
});

test("validateProductInput rejects an invalid audience value even as a draft", () => {
  // @ts-expect-error -- deliberately invalid to exercise the rejection path
  const result = validateProductInput({ ...draftProduct, audience: "other" });
  assert.equal(result, "Invalid audience");
});

test("validateProductInput accepts each of the 4 real audiences", () => {
  for (const audience of ["men", "women", "unisex", "kids_baby"] as const) {
    const result = validateProductInput({ ...draftProduct, audience });
    assert.equal(result, null);
  }
});

test("validateProductInput requires audience to publish", () => {
  const result = validateProductInput({
    ...draftProduct,
    status: "published",
    brandSlug: "nola",
    productTypeId: "leaf-1",
    variants: [{ ...baseVariant, quantity: 5 }],
  });
  assert.equal(result, "Audience must be selected before publishing");
});

test("validateProductInput requires a brand to publish", () => {
  const result = validateProductInput({
    ...draftProduct,
    status: "published",
    audience: "unisex",
    productTypeId: "leaf-1",
    variants: [{ ...baseVariant, quantity: 5 }],
  });
  assert.equal(result, "A brand must be selected before publishing");
});

test("validateProductInput requires a complete taxonomy leaf to publish", () => {
  const result = validateProductInput({
    ...draftProduct,
    status: "published",
    audience: "unisex",
    brandSlug: "nola",
    variants: [{ ...baseVariant, quantity: 5 }],
  });
  assert.equal(
    result,
    "A complete Main Category / Product Group / Product Type selection is required before publishing"
  );
});

test("validateProductInput accepts a fully complete publish submission", () => {
  const result = validateProductInput({
    ...draftProduct,
    status: "published",
    audience: "men",
    brandSlug: "nola",
    productTypeId: "leaf-1",
    variants: [{ ...baseVariant, quantity: 5 }],
  });
  assert.equal(result, null);
});

test("deriveCategoryFromAudience maps each audience to the legacy category/isUnisex pair", () => {
  assert.deepEqual(deriveCategoryFromAudience("men"), { category: "men", isUnisex: false });
  assert.deepEqual(deriveCategoryFromAudience("women"), { category: "women", isUnisex: false });
  assert.deepEqual(deriveCategoryFromAudience("unisex"), { category: "women", isUnisex: true });
  assert.deepEqual(deriveCategoryFromAudience("kids_baby"), { category: "kids", isUnisex: false });
});

test("deriveCategoryFromAudience returns a null category for a missing/legacy audience, never guessing", () => {
  assert.deepEqual(deriveCategoryFromAudience(undefined), { category: null, isUnisex: false });
  assert.deepEqual(deriveCategoryFromAudience(null), { category: null, isUnisex: false });
});

const baseBrand: BrandInput = {
  slug: "nola",
  name: "Nola",
  tagline: "Everyday essentials",
  category: "Clothing",
  city: "Cairo",
  heroImage: "/hero.jpg",
  aboutDescription: "About",
  aboutImage: "/about.jpg",
  storyImage: "/story.jpg",
  storyBody: "Story",
  infoBadges: [],
  categoryTabs: [],
  activeTab: "shop-all",
  values: [],
  similarBrandSlugs: [],
  shopTheLook: [],
};

test("validateBrandInput accepts a brand with no SKU prefix set yet", () => {
  assert.equal(validateBrandInput(baseBrand), null);
});

test("validateBrandInput accepts a valid SKU prefix", () => {
  assert.equal(validateBrandInput({ ...baseBrand, skuPrefix: "NOLA" }), null);
  assert.equal(validateBrandInput({ ...baseBrand, skuPrefix: "N1" }), null);
});

test("validateBrandInput rejects a malformed SKU prefix", () => {
  assert.equal(validateBrandInput({ ...baseBrand, skuPrefix: "n" }), "SKU Prefix must be 2–6 uppercase letters/numbers");
  assert.equal(validateBrandInput({ ...baseBrand, skuPrefix: "TOO-LONG-PREFIX" }), "SKU Prefix must be 2–6 uppercase letters/numbers");
  assert.equal(validateBrandInput({ ...baseBrand, skuPrefix: "no-caps" }), "SKU Prefix must be 2–6 uppercase letters/numbers");
});
