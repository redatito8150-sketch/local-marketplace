import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateItemRefundEligibility,
  calculateRefundAmount,
  RefundValidationError,
} from "../lib/returns/refundCalculation.ts";
import type { OrderItemSnapshot, RefundRequestLine } from "../types/returns.ts";

function snapshot(overrides: Partial<OrderItemSnapshot> = {}): OrderItemSnapshot {
  return {
    orderItemId: "item-1",
    quantity: 2,
    paidUnitPrice: 100,
    currency: "EGP",
    itemCouponDiscountEgp: 0,
    ...overrides,
  };
}

function requestLine(overrides: Partial<RefundRequestLine> = {}): RefundRequestLine {
  return {
    orderItem: snapshot(),
    refundQuantity: 1,
    alreadyRefundedQuantity: 0,
    ...overrides,
  };
}

test("a product without any discount refunds exactly paidUnitPrice * refundQuantity", () => {
  const result = calculateRefundAmount({
    lines: [requestLine({ orderItem: snapshot({ paidUnitPrice: 250, quantity: 1 }), refundQuantity: 1 })],
    orderShippingFeeEgp: 50,
    isFullOrderReturn: false,
    deliveryFeePolicy: "never_refund_delivery",
  });
  assert.equal(result.lineAmounts[0].amount, 250);
  assert.equal(result.totalRefundEgp, 250);
});

test("full refund of a quantity>1 line subtracts the line's entire coupon share, not a proportional recomputation", () => {
  const result = calculateRefundAmount({
    lines: [
      requestLine({
        orderItem: snapshot({ paidUnitPrice: 100, quantity: 3, itemCouponDiscountEgp: 30 }),
        refundQuantity: 3,
      }),
    ],
    orderShippingFeeEgp: 0,
    isFullOrderReturn: true,
    deliveryFeePolicy: "never_refund_delivery",
  });
  // 100*3 - 30 = 270
  assert.equal(result.lineAmounts[0].amount, 270);
});

test("partial refund takes a proportional share of the line's coupon discount", () => {
  const result = calculateRefundAmount({
    lines: [
      requestLine({
        orderItem: snapshot({ paidUnitPrice: 100, quantity: 4, itemCouponDiscountEgp: 40 }),
        refundQuantity: 1,
        alreadyRefundedQuantity: 0,
      }),
    ],
    orderShippingFeeEgp: 0,
    isFullOrderReturn: false,
    deliveryFeePolicy: "never_refund_delivery",
  });
  // 1/4 of the line: 100 - (40/4) = 90
  assert.equal(result.lineAmounts[0].amount, 90);
});

test("returning fewer units than originally purchased is eligible, and the remaining quantity accounts for it", () => {
  const eligibility = calculateItemRefundEligibility(
    requestLine({ orderItem: snapshot({ quantity: 5 }), refundQuantity: 2, alreadyRefundedQuantity: 0 })
  );
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.remainingQuantity, 5);
});

test("a second partial refund respects units already refunded earlier", () => {
  const eligibility = calculateItemRefundEligibility(
    requestLine({ orderItem: snapshot({ quantity: 5 }), refundQuantity: 3, alreadyRefundedQuantity: 2 })
  );
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.remainingQuantity, 3);
});

test("prevents a refund exceeding the originally purchased quantity", () => {
  const eligibility = calculateItemRefundEligibility(
    requestLine({ orderItem: snapshot({ quantity: 2 }), refundQuantity: 3, alreadyRefundedQuantity: 0 })
  );
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "EXCEEDS_PURCHASED_QUANTITY");
});

test("prevents a refund exceeding what remains after a prior partial refund (over-refund prevention)", () => {
  const eligibility = calculateItemRefundEligibility(
    requestLine({ orderItem: snapshot({ quantity: 5 }), refundQuantity: 4, alreadyRefundedQuantity: 3 })
  );
  assert.equal(eligibility.eligible, false);
  assert.equal(eligibility.reason, "EXCEEDS_REMAINING_QUANTITY");
});

test("calculateRefundAmount throws RefundValidationError rather than silently computing an over-refund", () => {
  assert.throws(
    () =>
      calculateRefundAmount({
        lines: [requestLine({ orderItem: snapshot({ quantity: 2 }), refundQuantity: 3 })],
        orderShippingFeeEgp: 0,
        isFullOrderReturn: false,
        deliveryFeePolicy: "never_refund_delivery",
      }),
    RefundValidationError
  );
});

test("a computed refund can never exceed the amount actually paid for the line", () => {
  // paidUnitPrice 10, coupon somehow larger than the line total would push
  // the naive subtraction negative — must clamp at 0, never go negative.
  const result = calculateRefundAmount({
    lines: [
      requestLine({
        orderItem: snapshot({ paidUnitPrice: 10, quantity: 1, itemCouponDiscountEgp: 10 }),
        refundQuantity: 1,
      }),
    ],
    orderShippingFeeEgp: 0,
    isFullOrderReturn: false,
    deliveryFeePolicy: "never_refund_delivery",
  });
  assert.equal(result.lineAmounts[0].amount, 0);
  assert.ok(result.lineAmounts[0].amount >= 0);
});

test("full refund: every unit across a multi-line order, delivery fee refunded only under refund_delivery_on_full_order_return + isFullOrderReturn", () => {
  const result = calculateRefundAmount({
    lines: [
      requestLine({ orderItem: snapshot({ orderItemId: "a", paidUnitPrice: 100, quantity: 2 }), refundQuantity: 2 }),
      requestLine({ orderItem: snapshot({ orderItemId: "b", paidUnitPrice: 50, quantity: 1 }), refundQuantity: 1 }),
    ],
    orderShippingFeeEgp: 50,
    isFullOrderReturn: true,
    deliveryFeePolicy: "refund_delivery_on_full_order_return",
  });
  assert.equal(result.itemsSubtotalEgp, 250);
  assert.equal(result.deliveryFeeRefundEgp, 50);
  assert.equal(result.totalRefundEgp, 300);
});

test("never_refund_delivery policy never refunds the delivery fee, even on a full order return", () => {
  const result = calculateRefundAmount({
    lines: [requestLine({ orderItem: snapshot({ paidUnitPrice: 100, quantity: 1 }), refundQuantity: 1 })],
    orderShippingFeeEgp: 50,
    isFullOrderReturn: true,
    deliveryFeePolicy: "never_refund_delivery",
  });
  assert.equal(result.deliveryFeeRefundEgp, 0);
});

test("a partial return never refunds delivery even under refund_delivery_on_full_order_return", () => {
  const result = calculateRefundAmount({
    lines: [requestLine({ orderItem: snapshot({ paidUnitPrice: 100, quantity: 2 }), refundQuantity: 1 })],
    orderShippingFeeEgp: 50,
    isFullOrderReturn: false,
    deliveryFeePolicy: "refund_delivery_on_full_order_return",
  });
  assert.equal(result.deliveryFeeRefundEgp, 0);
});

test("USD lines are never discounted by a coupon and refund at exactly paidUnitPrice * refundQuantity", () => {
  const result = calculateRefundAmount({
    lines: [
      requestLine({
        orderItem: snapshot({ currency: "USD", paidUnitPrice: 40, quantity: 2, itemCouponDiscountEgp: 0 }),
        refundQuantity: 2,
      }),
    ],
    orderShippingFeeEgp: 0,
    isFullOrderReturn: true,
    deliveryFeePolicy: "never_refund_delivery",
  });
  assert.equal(result.itemsSubtotalUsd, 80);
  assert.equal(result.totalRefundUsd, 80);
});

test("historical order items with no coupon snapshot (item_coupon_discount_egp defaults to 0) refund at the plain paid price", () => {
  const result = calculateRefundAmount({
    lines: [requestLine({ orderItem: snapshot({ paidUnitPrice: 75, quantity: 1, itemCouponDiscountEgp: 0 }), refundQuantity: 1 })],
    orderShippingFeeEgp: 0,
    isFullOrderReturn: false,
    deliveryFeePolicy: "never_refund_delivery",
  });
  assert.equal(result.lineAmounts[0].amount, 75);
});

test("a zero or non-integer refund quantity is never eligible", () => {
  assert.equal(calculateItemRefundEligibility(requestLine({ refundQuantity: 0 })).eligible, false);
  assert.equal(calculateItemRefundEligibility(requestLine({ refundQuantity: 1.5 })).eligible, false);
  assert.equal(calculateItemRefundEligibility(requestLine({ refundQuantity: -1 })).eligible, false);
});
