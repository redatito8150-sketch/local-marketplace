import assert from "node:assert/strict";
import test from "node:test";
import { buildProductPersistencePayload } from "../lib/admin/productPersistence.ts";
import type { ProductInput } from "../lib/admin/productValidation.ts";

const product: ProductInput = {
  name: "Linen Shirt",
  brandId: "brand-nola",
  productTypeId: "type-shirts",
  audience: "women",
  price: 1200,
  currency: "EGP",
  image: "/shirt.jpg",
  images: ["/shirt.jpg"],
  description: "A linen shirt",
  details: ["Linen"],
  careInstructions: ["Cold wash"],
  shippingReturns: "14 days",
  isNew: true,
  featured: false,
  status: "published",
  defaultLowStockThreshold: 5,
  optionTypeIds: [],
  valueIdsByOptionType: {},
  variants: [
    {
      optionValueIds: [],
      sku: " SHIRT-1-M ",
      quantity: 4,
      sellingStatus: "active",
    },
  ],
  colorImages: {},
};

test("maps a validated product form to database field names", () => {
  const payload = buildProductPersistencePayload(product);

  assert.equal(payload.brand_id, "brand-nola");
  assert.equal(payload.audience, "women");
  assert.equal(payload.product_type_id, "type-shirts");
  assert.equal(payload.default_low_stock_threshold, 5);
  // sku is never part of this payload — always server-generated (insert)
  // or left untouched (update), never client-supplied.
  assert.equal("sku" in payload, false);
});

test("supports controlled publish overrides without mutating the input", () => {
  const payload = buildProductPersistencePayload(product, {
    status: "published",
    submittedBy: "00000000-0000-0000-0000-000000000001",
    clearReviewState: true,
  });

  assert.equal(payload.pending_changes, null);
  assert.equal(payload.submitted_by, "00000000-0000-0000-0000-000000000001");
  assert.equal(product.brandId, "brand-nola");
});
