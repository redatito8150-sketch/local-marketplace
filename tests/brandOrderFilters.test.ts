import test from "node:test";
import assert from "node:assert/strict";
import { filterBrandOrders } from "../lib/orders/brandOrderFilters.ts";
import type { BrandOrder } from "../lib/data/brandPortal.ts";

const order = {
  id: "order-1",
  orderNumber: "LC-905589",
  status: "fulfilled",
  shippingName: "Mona Ali",
  shippingCity: "Cairo",
  shippingGovernorate: "Cairo",
  createdAt: "2026-08-12T10:00:00.000Z",
  history: [],
  isOverdue: false,
  fulfillmentType: "brand_direct",
  shippingFeeEgp: 50,
  paymentMethod: "card",
  paymentStatus: "paid",
  brandProductsSubtotalEgp: 900,
  brandDiscountEgp: 0,
  couponCode: null,
  masterOrderNumber: null,
  items: [{
    id: "item-1", productId: "product-1", variantId: "variant-1", name: "Thabat Top",
    size: "M", color: "Baby Blue", price: 900, currency: "EGP", quantity: 1,
    originalUnitPrice: null, discountPercentSnapshot: null, discountSource: null,
    itemCouponDiscountEgp: 0,
  }],
} satisfies BrandOrder;

for (const query of ["LC-905589", "#LC-905589", "905589", "lc905589", "٩٠٥٥٨٩"]) {
  test(`order search accepts ${query}`, () => {
    assert.deepEqual(filterBrandOrders([order], { q: query }), [order]);
  });
}

test("order search still matches customer and product text", () => {
  assert.equal(filterBrandOrders([order], { q: "mona" }).length, 1);
  assert.equal(filterBrandOrders([order], { q: "baby blue" }).length, 1);
  assert.equal(filterBrandOrders([order], { q: "not present" }).length, 0);
});
