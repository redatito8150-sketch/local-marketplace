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
    mainCategory: "Clothing",
    productGroup: "Tops",
    productTypeName: "T-Shirts",
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
  brandId: "brand-1",
  productTypeId: "type-tshirts",
  audience: "unisex",
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
  trackInventory: true,
  featured: false,
  status: "draft",
  variants: [
    { quantity: 1, lowStockThreshold: 1, availabilityStatus: "available" },
  ],
};

test("buildProductPersistencePayload always writes brand_id, audience, and product_type_id", () => {
  const payload = buildProductPersistencePayload(baseProduct, {
    colors: [],
    sizes: ["M"],
    unavailableSizes: [],
    inStock: true,
  });
  assert.equal(payload.brand_id, "brand-1");
  assert.equal(payload.audience, "unisex");
  assert.equal(payload.product_type_id, "type-tshirts");
  assert.equal(payload.collection_id, null);
});

test("buildProductPersistencePayload writes collection_id when a collection is selected", () => {
  const payload = buildProductPersistencePayload(
    { ...baseProduct, collectionId: "collection-1" },
    { colors: [], sizes: ["M"], unavailableSizes: [], inStock: true }
  );
  assert.equal(payload.collection_id, "collection-1");
});
