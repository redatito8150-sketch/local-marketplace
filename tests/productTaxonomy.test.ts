import assert from "node:assert/strict";
import test from "node:test";
import { validateTaxonomyChain, type TaxonomyChainRow } from "../lib/admin/taxonomyChainValidation.ts";
import {
  buildProductPersistencePayload,
} from "../lib/admin/productPersistence.ts";
import type { ProductInput } from "../lib/admin/productValidation.ts";

const clothing: TaxonomyChainRow = {
  id: "main-clothing",
  parent_id: null,
  level: 1,
  is_active: true,
  name: "Clothing",
};
const tops: TaxonomyChainRow = {
  id: "group-tops",
  parent_id: "main-clothing",
  level: 2,
  is_active: true,
  name: "Tops",
};
const bottoms: TaxonomyChainRow = {
  id: "group-bottoms",
  parent_id: "main-clothing",
  level: 2,
  is_active: true,
  name: "Bottoms",
};
const tshirts: TaxonomyChainRow = {
  id: "type-tshirts",
  parent_id: "group-tops",
  level: 3,
  is_active: true,
  name: "T-Shirts",
};

test("validateTaxonomyChain accepts a fully valid Main Category -> Product Group -> Product Type chain", () => {
  const result = validateTaxonomyChain(tshirts, tops, clothing);
  assert.deepEqual(result, {
    valid: true,
    productTypeId: "type-tshirts",
    productCategory: "Clothing",
    productType: "T-Shirts",
  });
});

test("validateTaxonomyChain rejects a missing product type (leaf)", () => {
  const result = validateTaxonomyChain(null, tops, clothing);
  assert.equal(result.valid, false);
});

test("validateTaxonomyChain rejects a product type with no product group", () => {
  const result = validateTaxonomyChain(tshirts, null, clothing);
  assert.equal(result.valid, false);
});

test("validateTaxonomyChain rejects a product type that belongs to a different product group", () => {
  // tshirts.parent_id is "group-tops", not "group-bottoms" — a mismatched
  // group must never be accepted even if it's otherwise a valid level-2 node.
  const result = validateTaxonomyChain(tshirts, bottoms, clothing);
  assert.equal(result.valid, false);
});

test("validateTaxonomyChain rejects an inactive node anywhere in the chain", () => {
  const inactiveGroup = { ...tops, is_active: false };
  const result = validateTaxonomyChain(tshirts, inactiveGroup, clothing);
  assert.equal(result.valid, false);
});

test("validateTaxonomyChain rejects a node at the wrong level", () => {
  const wrongLevelGroup = { ...tops, level: 3 };
  const result = validateTaxonomyChain(tshirts, wrongLevelGroup, clothing);
  assert.equal(result.valid, false);
});

const baseProduct: ProductInput = {
  name: "T-Shirt",
  brandName: "Nola",
  productCategory: "Clothing",
  productType: "T-Shirts",
  price: 500,
  currency: "EGP",
  image: "/tshirt.jpg",
  colors: [],
  sizes: ["M"],
  description: "A t-shirt",
  details: [],
  careInstructions: [],
  shippingReturns: "",
  isNew: false,
  isUnisex: false,
  trackInventory: true,
  featured: false,
  status: "draft",
  variants: [
    { quantity: 1, lowStockThreshold: 1, availabilityStatus: "available" },
  ],
};

test("buildProductPersistencePayload writes product_type_id when present", () => {
  const payload = buildProductPersistencePayload(
    { ...baseProduct, productTypeId: "type-tshirts" },
    { colors: [], sizes: ["M"], unavailableSizes: [], inStock: true }
  );
  assert.equal(payload.product_type_id, "type-tshirts");
});

test("buildProductPersistencePayload writes a null product_type_id when absent (legacy product)", () => {
  const payload = buildProductPersistencePayload(baseProduct, {
    colors: [],
    sizes: ["M"],
    unavailableSizes: [],
    inStock: true,
  });
  assert.equal(payload.product_type_id, null);
  // The legacy text fields still persist unchanged — an existing product
  // outside the new taxonomy tree keeps working exactly as before.
  assert.equal(payload.product_category, "Clothing");
  assert.equal(payload.product_type, "T-Shirts");
});
