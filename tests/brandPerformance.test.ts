import test from "node:test";
import assert from "node:assert/strict";
import { buildBrandPerformanceSeries, percentageChange, summarizeBrandPerformance } from "../lib/analytics/brandPerformance.ts";
import type { BrandOrder } from "../lib/data/brandPortal.ts";

function order(overrides: Partial<BrandOrder> = {}): BrandOrder {
  return {
    id: "o1", orderNumber: "LC-1", status: "fulfilled", shippingName: "A", shippingCity: "Cairo",
    shippingGovernorate: "Cairo", createdAt: "2026-08-12T22:30:00.000Z", history: [], isOverdue: false,
    fulfillmentType: "brand_direct", shippingFeeEgp: 50, paymentMethod: "card", paymentStatus: "paid",
    capturedAmountCents: 100_00, refundedAmountCents: 0, refundPendingAmountCents: 0,
    brandProductsSubtotalEgp: 1000, brandDiscountEgp: 100, couponCode: null, masterOrderNumber: null,
    items: [{ id: "i1", productId: "p1", variantId: "v1", name: "Top", size: "M", price: 500, currency: "EGP", quantity: 2, originalUnitPrice: null, discountPercentSnapshot: null, discountSource: null, itemCouponDiscountEgp: 100 }],
    ...overrides,
  };
}

test("brand analytics uses Cairo dates, net brand sales, units, and excludes cancelled orders", () => {
  const series = buildBrandPerformanceSeries([order(), order({ id: "cancelled", status: "cancelled" })], "2026-08-13", "2026-08-13");
  assert.equal(series.length, 1);
  assert.deepEqual(summarizeBrandPerformance(series), { sales: 900, orders: 1, units: 2, aov: 900 });
});

test("percentage change handles empty previous periods without fake infinity", () => {
  assert.equal(percentageChange(0, 0), 0);
  assert.equal(percentageChange(100, 0), null);
  assert.equal(percentageChange(150, 100), 50);
});
