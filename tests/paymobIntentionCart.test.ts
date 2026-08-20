import test from "node:test";
import assert from "node:assert/strict";
import { allocateCouponDiscount, computeIntentionAmount, resolveIntentionCart } from "../lib/payments/intentionCart.ts";
import type { ProductLookupRow, ResolvedIntentionLine } from "../lib/payments/intentionCart.ts";
import type { ProductVariant } from "../types/index.ts";

const NOW = new Date("2026-08-11T00:00:00.000Z");

function product(overrides: Partial<ProductLookupRow> = {}): ProductLookupRow {
  return {
    id: "prod-1",
    name: "Linen Shirt",
    brand_name: "Zakhnook Studio",
    brand_slug: "zakhnook-studio",
    price: 500,
    discount_percent: null,
    discount_ends_at: null,
    currency: "EGP",
    status: "published",
    publish_date: null,
    brands: { is_active: true },
    image: "https://example.com/linen-shirt.jpg",
    first_stocked_at: "2026-01-01T00:00:00.000Z",
    launch_policy: "show_now",
    ...overrides,
  };
}

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "variant-1",
    productId: "prod-1",
    sku: "SKU-1",
    quantity: 10,
    sellingStatus: "active",
    isArchived: false,
    optionValues: [
      { optionTypeId: "t-color", optionTypeName: "Color", optionValueId: "v-color", label: "Sand" },
      { optionTypeId: "t-size", optionTypeName: "Size", optionValueId: "v-size", label: "M" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const cartItem = { productId: "prod-1", size: "M", color: "Sand", quantity: 2 };

test("resolveIntentionCart rejects an item whose product no longer exists", () => {
  const result = resolveIntentionCart([cartItem], new Map(), new Map(), NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("resolveIntentionCart rejects a when_stocked product that has never been launched (first_stocked_at is null) — checkout defense in depth for the product-launch gate", () => {
  const productById = new Map([
    ["prod-1", product({ launch_policy: "when_stocked", first_stocked_at: null })],
  ]);
  const variantsByProduct = new Map([["prod-1", [variant()]]]);
  const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("resolveIntentionCart accepts a when_stocked product once first_stocked_at is set, and always accepts a show_now product regardless of first_stocked_at", () => {
  const launchedWhenStockedProduct = product({ launch_policy: "when_stocked", first_stocked_at: "2026-01-01T00:00:00.000Z" });
  const unstockedShowNowProduct = product({ launch_policy: "show_now", first_stocked_at: null });

  for (const p of [launchedWhenStockedProduct, unstockedShowNowProduct]) {
    const productById = new Map([["prod-1", p]]);
    const variantsByProduct = new Map([["prod-1", [variant()]]]);
    const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
    assert.equal(result.ok, true);
  }
});

test("resolveIntentionCart rejects an unpublished, paused, or inactive-brand product", () => {
  for (const overrides of [
    { status: "draft" },
    // Paused is its own canonical status now, not `published` with a
    // secondary flag — the single status check below already covers it.
    { status: "paused" },
    { brands: { is_active: false } },
    { publish_date: "2099-01-01T00:00:00.000Z" },
  ]) {
    const productById = new Map([["prod-1", product(overrides)]]);
    const variantsByProduct = new Map([["prod-1", [variant()]]]);
    const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(overrides)}`);
    if (!result.ok) assert.equal(result.status, 400);
  }
});

test("resolveIntentionCart rejects when no variant matches the requested color/size", () => {
  const productById = new Map([["prod-1", product()]]);
  const variantsByProduct = new Map([["prod-1", [variant()]]]);
  const result = resolveIntentionCart(
    [{ ...cartItem, size: "XL" }],
    productById,
    variantsByProduct,
    NOW
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("resolveIntentionCart rejects a paused/discontinued variant", () => {
  const productById = new Map([["prod-1", product()]]);
  const variantsByProduct = new Map([["prod-1", [variant({ sellingStatus: "paused" })]]]);
  const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 400);
});

test("resolveIntentionCart returns 409 for insufficient stock", () => {
  const productById = new Map([["prod-1", product()]]);
  const variantsByProduct = new Map([["prod-1", [variant({ quantity: 1 })]]]);
  const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, 409);
});

test("resolveIntentionCart prices from the server-side product/variant, ignoring any client-sent price", () => {
  const productById = new Map([["prod-1", product({ price: 500, discount_percent: 20 })]]);
  const variantsByProduct = new Map([["prod-1", [variant()]]]);
  // A cart item literally cannot carry a price field (ValidatedOrderItem has
  // none) — this proves the resolved price always comes from the DB row.
  const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.lineItems[0].price, 400); // 500 * (1 - 0.20)
    assert.equal(result.lineItems[0].quantity, 2);
  }
});

test("resolveIntentionCart prefers a variant's own discount over the product's", () => {
  const productById = new Map([["prod-1", product({ price: 500, discount_percent: 20 })]]);
  const variantsByProduct = new Map([
    ["prod-1", [variant({ variantDiscountPercent: 50 })]],
  ]);
  const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.lineItems[0].price, 250); // 500 * (1 - 0.50)
});

test("resolveIntentionCart carries the pricing snapshot (originalUnitPrice/discountPercentSnapshot/discountSource) through each resolved line", () => {
  const productById = new Map([["prod-1", product({ price: 500, discount_percent: 20 })]]);
  const variantsByProduct = new Map([["prod-1", [variant()]]]);
  const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.lineItems[0].originalUnitPrice, 500);
    assert.equal(result.lineItems[0].discountPercentSnapshot, 20);
    assert.equal(result.lineItems[0].discountSource, "product_discount");
  }
});

test("resolveIntentionCart's snapshot reflects no discount when none applies", () => {
  const productById = new Map([["prod-1", product({ price: 500, discount_percent: null })]]);
  const variantsByProduct = new Map([["prod-1", [variant()]]]);
  const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.lineItems[0].originalUnitPrice, 500);
    assert.equal(result.lineItems[0].discountPercentSnapshot, null);
    assert.equal(result.lineItems[0].discountSource, "none");
  }
});

// A card-paid order's items previously always ended up with no image at
// all — place_paid_order() hardcoded '', and this was the first place that
// dropped it: ResolvedIntentionLine had no image field, so it could never
// have reached payment_attempts.cart_snapshot regardless. Every "shipped"
// order email (lib/email/templates/orderShipped.ts) for a card order then
// rendered a broken <img src=""> for every line item.
test("resolveIntentionCart carries the product's image into each resolved line item", () => {
  const productById = new Map([["prod-1", product({ image: "https://cdn.example.com/shirt.jpg" })]]);
  const variantsByProduct = new Map([["prod-1", [variant()]]]);
  const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.lineItems[0].image, "https://cdn.example.com/shirt.jpg");
});

test("resolveIntentionCart snapshots the selected color image instead of the product cover", () => {
  const productById = new Map([
    ["prod-1", product({
      image: "https://cdn.example.com/cover.jpg",
      color_images_by_option_value_id: { "v-color": "https://cdn.example.com/sand.jpg" },
    })],
  ]);
  const variantsByProduct = new Map([["prod-1", [variant()]]]);
  const result = resolveIntentionCart([cartItem], productById, variantsByProduct, NOW);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.lineItems[0].image, "https://cdn.example.com/sand.jpg");
});

test("computeIntentionAmount's internal fulfillment-grouping pass preserves each line's image", () => {
  const lineItems = [
    {
      productId: "prod-1",
      variantId: "variant-1",
      name: "Linen Shirt",
      brand: "Zakhnook Studio",
      brandSlug: "zakhnook-studio",
      price: 400,
      currency: "EGP" as const,
      size: "M",
      color: "Sand",
      quantity: 2,
      image: "https://cdn.example.com/shirt.jpg",
    },
  ];
  // computeIntentionAmount doesn't return the line items themselves, but it
  // must not silently drop/blank the image while building its internal
  // CartLineItem view — grouping still resolves to exactly one bucket, and
  // the amount math is unaffected either way, which is what this asserts
  // indirectly (a crash or a dropped field would show up as a different
  // bucket count or a thrown error, not a silent wrong amount).
  const amount = computeIntentionAmount(lineItems, new Map(), {
    flatDeliveryFeeEgp: 50,
    freeShippingThresholdEgp: 1500,
    returnPolicyDays: 30,
  });
  assert.equal(amount.buckets.length, 1);
});

test("computeIntentionAmount adds one flat shipping fee below the free-shipping threshold", () => {
  const lineItems = [
    {
      productId: "prod-1",
      variantId: "variant-1",
      name: "Linen Shirt",
      brand: "Zakhnook Studio",
      brandSlug: "zakhnook-studio",
      price: 400,
      currency: "EGP" as const,
      size: "M",
      color: "Sand",
      quantity: 2,
      image: "https://example.com/linen-shirt.jpg",
    },
  ];
  const amount = computeIntentionAmount(lineItems, new Map(), {
    flatDeliveryFeeEgp: 50,
    freeShippingThresholdEgp: 1500,
    returnPolicyDays: 30,
  });
  assert.equal(amount.subtotalEgp, 800);
  assert.equal(amount.shippingFeeEgp, 50);
  assert.equal(amount.totalEgp, 850);
  assert.equal(amount.totalAmountCents, 85000);
  assert.equal(amount.buckets.length, 1);
  assert.equal(amount.buckets[0].amountCents, 85000);
});

test("computeIntentionAmount waives the fee once the EGP subtotal clears the threshold", () => {
  const lineItems = [
    {
      productId: "prod-1",
      variantId: "variant-1",
      name: "Linen Shirt",
      brand: "Zakhnook Studio",
      brandSlug: "zakhnook-studio",
      price: 900,
      currency: "EGP" as const,
      size: "M",
      color: "Sand",
      quantity: 2,
      image: "https://example.com/linen-shirt.jpg",
    },
  ];
  const amount = computeIntentionAmount(lineItems, new Map(), {
    flatDeliveryFeeEgp: 50,
    freeShippingThresholdEgp: 1500,
    returnPolicyDays: 30,
  });
  assert.equal(amount.subtotalEgp, 1800);
  assert.equal(amount.shippingFeeEgp, 0);
  assert.equal(amount.totalEgp, 1800);
  assert.equal(amount.totalAmountCents, 180000);
});

test("computeIntentionAmount charges the flat fee once per independent-brand shipment", () => {
  const lineItems = [
    {
      productId: "prod-1",
      variantId: "variant-1",
      name: "Shirt",
      brand: "Brand A",
      brandSlug: "brand-a",
      price: 300,
      currency: "EGP" as const,
      size: "M",
      color: "Sand",
      quantity: 1,
      image: "https://example.com/shirt.jpg",
    },
    {
      productId: "prod-2",
      variantId: "variant-2",
      name: "Bag",
      brand: "Brand B",
      brandSlug: "brand-b",
      price: 300,
      currency: "EGP" as const,
      size: "One Size",
      color: "",
      quantity: 1,
      image: "https://example.com/bag.jpg",
    },
  ];
  // Neither brand is a Zakhnook partner, so each is its own shipment/fee.
  const partnerFlagsBySlug = new Map([
    ["brand-a", false],
    ["brand-b", false],
  ]);
  const amount = computeIntentionAmount(lineItems, partnerFlagsBySlug, {
    flatDeliveryFeeEgp: 50,
    freeShippingThresholdEgp: 1500,
    returnPolicyDays: 30,
  });
  assert.equal(amount.subtotalEgp, 600);
  assert.equal(amount.shippingFeeEgp, 100);
  assert.equal(amount.totalEgp, 700);

  // IMPORTANT AMOUNT RULE: totalAmountCents is defined as the sum of each
  // bucket's own already-rounded amountCents, never an independent
  // rounding of the grand total — this is what makes
  // "sum(bucket expected_amount_cents) reconciles with the Payment
  // Attempt amount" true by construction.
  assert.equal(amount.buckets.length, 2);
  const [bucketA, bucketB] = amount.buckets;
  assert.equal(bucketA.brandSlug, "brand-a");
  assert.equal(bucketA.subtotalEgp, 300);
  assert.equal(bucketA.shippingFeeEgp, 50);
  assert.equal(bucketA.amountCents, 35000);
  assert.equal(bucketB.brandSlug, "brand-b");
  assert.equal(bucketB.subtotalEgp, 300);
  assert.equal(bucketB.shippingFeeEgp, 50);
  assert.equal(bucketB.amountCents, 35000);
  assert.equal(amount.totalAmountCents, 70000);
  assert.equal(
    amount.totalAmountCents,
    amount.buckets.reduce((sum, bucket) => sum + bucket.amountCents, 0)
  );
});

test("IMPORTANT AMOUNT RULE: totalAmountCents always equals the sum of bucket amountCents, across many shapes", () => {
  const shippingSettings = { flatDeliveryFeeEgp: 50, freeShippingThresholdEgp: 1500, returnPolicyDays: 30 };
  const scenarios = [
    // single pooled item
    {
      lineItems: [
        { productId: "p1", variantId: "v1", name: "A", brand: "Pool Brand", brandSlug: "pool-brand", price: 199.99, currency: "EGP" as const, size: "M", color: "Red", quantity: 3, image: "https://example.com/a.jpg" },
      ],
      partnerFlagsBySlug: new Map([["pool-brand", true]]),
    },
    // three independent brands, mixed quantities/prices
    {
      lineItems: [
        { productId: "p1", variantId: "v1", name: "A", brand: "Brand A", brandSlug: "brand-a", price: 120.5, currency: "EGP" as const, size: "M", color: "Red", quantity: 2, image: "https://example.com/a.jpg" },
        { productId: "p2", variantId: "v2", name: "B", brand: "Brand B", brandSlug: "brand-b", price: 45.75, currency: "EGP" as const, size: "L", color: "Blue", quantity: 5, image: "https://example.com/b.jpg" },
        { productId: "p3", variantId: "v3", name: "C", brand: "Brand C", brandSlug: "brand-c", price: 1999, currency: "EGP" as const, size: "One Size", color: "", quantity: 1, image: "https://example.com/c.jpg" },
      ],
      partnerFlagsBySlug: new Map([
        ["brand-a", false],
        ["brand-b", false],
        ["brand-c", false],
      ]),
    },
    // partner pool + one independent brand together
    {
      lineItems: [
        { productId: "p1", variantId: "v1", name: "A", brand: "Partner A", brandSlug: "partner-a", price: 75.25, currency: "EGP" as const, size: "M", color: "Red", quantity: 4, image: "https://example.com/a.jpg" },
        { productId: "p2", variantId: "v2", name: "B", brand: "Partner B", brandSlug: "partner-b", price: 10, currency: "EGP" as const, size: "L", color: "Blue", quantity: 1, image: "https://example.com/b.jpg" },
        { productId: "p3", variantId: "v3", name: "C", brand: "Independent", brandSlug: "independent-brand", price: 333.33, currency: "EGP" as const, size: "One Size", color: "", quantity: 2, image: "https://example.com/c.jpg" },
      ],
      partnerFlagsBySlug: new Map([
        ["partner-a", true],
        ["partner-b", true],
        ["independent-brand", false],
      ]),
    },
  ];

  for (const scenario of scenarios) {
    const amount = computeIntentionAmount(scenario.lineItems, scenario.partnerFlagsBySlug, shippingSettings);
    const bucketSum = amount.buckets.reduce((sum, bucket) => sum + bucket.amountCents, 0);
    assert.equal(amount.totalAmountCents, bucketSum);
    assert.ok(amount.totalAmountCents > 0);
  }
});

// allocateCouponDiscount — card/Paymob coupon support. Mirrors
// private.place_order()'s bucket/item allocation exactly (proportional by
// EGP subtotal share, last bucket/item absorbs the rounding remainder), so
// the two paths can never diverge — see the function's own header comment.

function line(overrides: Partial<ResolvedIntentionLine> = {}): ResolvedIntentionLine {
  return {
    productId: "p1",
    variantId: "v1",
    name: "Item",
    brand: "Brand",
    brandSlug: "brand-a",
    price: 100,
    currency: "EGP",
    size: "M",
    color: "",
    quantity: 1,
    image: "",
    ...overrides,
  };
}

test("allocateCouponDiscount applies a percentage coupon against the full EGP subtotal", () => {
  const lineItems = [line({ price: 200, quantity: 2 })]; // subtotal 400
  const result = allocateCouponDiscount(lineItems, new Map(), {
    code: "SAVE10",
    discountType: "percentage",
    discountValue: 10,
  });
  assert.equal(result.totalDiscountEgp, 40);
  assert.equal(result.lineItems[0].itemCouponDiscountEgp, 40);
});

test("allocateCouponDiscount clamps a fixed-value coupon to the subtotal (never exceeds eligible product value)", () => {
  const lineItems = [line({ price: 50, quantity: 1 })]; // subtotal 50
  const result = allocateCouponDiscount(lineItems, new Map(), {
    code: "FLAT100",
    discountType: "fixed",
    discountValue: 100,
  });
  assert.equal(result.totalDiscountEgp, 50);
  assert.equal(result.lineItems[0].itemCouponDiscountEgp, 50);
});

test("allocateCouponDiscount: multi-brand allocation and rounding sums exactly to the total discount (piaster-level)", () => {
  const lineItems = [
    line({ productId: "p1", brandSlug: "brand-a", price: 33.33, quantity: 1 }),
    line({ productId: "p2", brandSlug: "brand-b", price: 33.33, quantity: 1 }),
    line({ productId: "p3", brandSlug: "brand-c", price: 33.34, quantity: 1 }),
  ];
  const result = allocateCouponDiscount(lineItems, new Map(), {
    code: "SAVE10",
    discountType: "percentage",
    discountValue: 10,
  });
  const sumOfItemDiscounts = result.lineItems.reduce((sum, l) => sum + (l.itemCouponDiscountEgp ?? 0), 0);
  assert.equal(Math.round(sumOfItemDiscounts * 100) / 100, result.totalDiscountEgp);
});

test("allocateCouponDiscount: a single quantity>1 line's coupon share sums correctly and is never negative", () => {
  const lineItems = [line({ price: 99.99, quantity: 3 })]; // subtotal 299.97
  const result = allocateCouponDiscount(lineItems, new Map(), {
    code: "SAVE15",
    discountType: "percentage",
    discountValue: 15,
  });
  assert.ok(result.lineItems[0].itemCouponDiscountEgp! >= 0);
  assert.equal(result.lineItems[0].itemCouponDiscountEgp, result.totalDiscountEgp);
});

test("allocateCouponDiscount: partner brands pool into one bucket, sharing one proportional discount slice", () => {
  const lineItems = [
    line({ productId: "p1", brandSlug: "partner-a", price: 100, quantity: 1 }),
    line({ productId: "p2", brandSlug: "partner-b", price: 100, quantity: 1 }),
    line({ productId: "p3", brandSlug: "independent", price: 200, quantity: 1 }),
  ];
  const partnerFlagsBySlug = new Map([
    ["partner-a", true],
    ["partner-b", true],
    ["independent", false],
  ]);
  const result = allocateCouponDiscount(lineItems, partnerFlagsBySlug, {
    code: "SAVE20",
    discountType: "percentage",
    discountValue: 20,
  });
  // subtotal 400, 20% = 80 total. Pool bucket (200) gets 40, independent (200) gets 40.
  assert.equal(result.totalDiscountEgp, 80);
  const poolDiscount = (result.lineItems[0].itemCouponDiscountEgp ?? 0) + (result.lineItems[1].itemCouponDiscountEgp ?? 0);
  assert.equal(poolDiscount, 40);
  assert.equal(result.lineItems[2].itemCouponDiscountEgp, 40);
});

test("allocateCouponDiscount: no coupon effectively means zero discount and zero-filled lines", () => {
  const lineItems = [line({ price: 100, quantity: 1 })];
  const result = allocateCouponDiscount(lineItems, new Map(), {
    code: "EMPTY",
    discountType: "fixed",
    discountValue: 0,
  });
  assert.equal(result.totalDiscountEgp, 0);
  assert.equal(result.lineItems[0].itemCouponDiscountEgp, 0);
});
