import assert from "node:assert/strict";
import test from "node:test";
import {
  buildProductPersistencePayload,
  buildVariantPersistencePayload,
} from "../lib/admin/productPersistence.ts";
import type { ProductInput } from "../lib/admin/productValidation.ts";

const product: ProductInput = {
  name: "Linen Shirt",
  brandName: "Nola",
  brandSlug: "nola",
  category: "women",
  productCategory: "Clothing",
  productType: "Shirts",
  price: 1200,
  currency: "EGP",
  image: "/shirt.jpg",
  images: ["/shirt.jpg"],
  colors: [{ name: "Navy", hex: "#102040" }],
  sizes: ["M"],
  description: "A linen shirt",
  details: ["Linen"],
  careInstructions: ["Cold wash"],
  shippingReturns: "14 days",
  sku: " SHIRT-1 ",
  isNew: true,
  isUnisex: false,
  trackInventory: true,
  featured: false,
  status: "published",
  variants: [
    {
      color: "Navy",
      size: "M",
      sku: " SHIRT-1-M ",
      quantity: 4,
      lowStockThreshold: 1,
      availabilityStatus: "available",
    },
  ],
};

test("maps a validated product form to database field names", () => {
  const payload = buildProductPersistencePayload(product, {
    colors: product.colors,
    sizes: ["M"],
    unavailableSizes: [],
    inStock: true,
  });

  assert.equal(payload.brand_slug, "nola");
  assert.equal(payload.product_category, "Clothing");
  assert.equal(payload.sku, "SHIRT-1");
  assert.deepEqual(payload.unavailable_sizes, []);
});

test("supports controlled publish overrides without mutating the input", () => {
  const payload = buildProductPersistencePayload(
    product,
    { colors: product.colors, sizes: ["M"], unavailableSizes: [], inStock: true },
    {
      brandSlug: "owned-brand",
      status: "published",
      submittedBy: "00000000-0000-0000-0000-000000000001",
      clearReviewState: true,
    }
  );

  assert.equal(payload.brand_slug, "owned-brand");
  assert.equal(payload.pending_changes, null);
  assert.equal(product.brandSlug, "nola");
});

test("maps variants without accepting product identity from the client", () => {
  assert.deepEqual(buildVariantPersistencePayload(product), [
    {
      color: "Navy",
      size: "M",
      sku: "SHIRT-1-M",
      quantity: 4,
      low_stock_threshold: 1,
      price_override: null,
      availability_status: "available",
    },
  ]);
});
