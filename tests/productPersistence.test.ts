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

test("featured and isNew are omitted entirely when the editor doesn't send them", () => {
  const { isNew, featured, ...rest } = product;
  const payload = buildProductPersistencePayload(rest as ProductInput);

  assert.equal("is_new" in payload, false);
  assert.equal("featured" in payload, false);
});

test("Publish Date: auto-stamps 'now' on a first-time transition to published", () => {
  const { publishDate, ...rest } = product;
  const before = Date.now();
  const payload = buildProductPersistencePayload(rest as ProductInput, {
    status: "published",
    previousPublishDate: null,
  });
  const after = Date.now();

  assert.ok(typeof payload.publish_date === "string");
  const stamped = new Date(payload.publish_date as string).getTime();
  assert.ok(stamped >= before && stamped <= after);
});

test("Publish Date: a later re-save of an already-published product leaves publish_date untouched", () => {
  const { publishDate, ...rest } = product;
  const payload = buildProductPersistencePayload(rest as ProductInput, {
    status: "published",
    previousPublishDate: "2026-01-01T00:00:00.000Z",
  });

  assert.equal("publish_date" in payload, false);
});

test("Publish Date: an explicit override always wins over auto-stamping", () => {
  const { publishDate, ...rest } = product;
  const payload = buildProductPersistencePayload(rest as ProductInput, {
    status: "published",
    publishDate: "2026-05-05T00:00:00.000Z",
    previousPublishDate: null,
  });

  assert.equal(payload.publish_date, "2026-05-05T00:00:00.000Z");
});
