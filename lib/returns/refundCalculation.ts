// Pure refund-calculation layer — types + functions only, no Supabase
// import, no live return/refund workflow wired to it anywhere yet. This is
// intentionally scoped exactly to that: the calculation layer a future
// returns feature will build on, so refunds are always based on the
// historical amount actually paid (order_items.price /
// item_coupon_discount_egp — see supabase/migrations/
// 20260813000002_order_pricing_snapshots.sql), never a product's current
// price. Same pure/injectable style already established by
// lib/payments/intentionCart.ts — the caller passes plain order_items data
// in, this file never reads a database.
//
// A real return workflow (UI, an orders/returns table, an actual refund
// trigger) is future work — see CLAUDE.local.md's Returns & Refunds spec
// note. Building it is explicitly out of scope here.

import type {
  DeliveryFeeRefundPolicy,
  LineRefundAmount,
  LineRefundEligibility,
  RefundCalculationInput,
  RefundCalculationResult,
  RefundRequestLine,
} from "../../types/returns";

export class RefundValidationError extends Error {
  readonly orderItemId: string;
  readonly reason: NonNullable<LineRefundEligibility["reason"]>;

  constructor(orderItemId: string, reason: NonNullable<LineRefundEligibility["reason"]>, message: string) {
    super(message);
    this.name = "RefundValidationError";
    this.orderItemId = orderItemId;
    this.reason = reason;
  }
}

// Never returns "eligible" for a request that would refund more units than
// were originally purchased, or more than remain after previously-recorded
// partial refunds — the two guards Section 5 explicitly requires ("returning
// fewer units than originally purchased", "prevention of refunds exceeding
// the amount originally paid").
export function calculateItemRefundEligibility(line: RefundRequestLine): LineRefundEligibility {
  const { orderItem, refundQuantity, alreadyRefundedQuantity } = line;
  const remainingQuantity = orderItem.quantity - alreadyRefundedQuantity;

  if (!Number.isInteger(refundQuantity) || refundQuantity <= 0) {
    return { orderItemId: orderItem.orderItemId, eligible: false, reason: "INVALID_QUANTITY", remainingQuantity };
  }
  if (refundQuantity > orderItem.quantity) {
    return {
      orderItemId: orderItem.orderItemId,
      eligible: false,
      reason: "EXCEEDS_PURCHASED_QUANTITY",
      remainingQuantity,
    };
  }
  if (refundQuantity > remainingQuantity) {
    return {
      orderItemId: orderItem.orderItemId,
      eligible: false,
      reason: "EXCEEDS_REMAINING_QUANTITY",
      remainingQuantity,
    };
  }
  return { orderItemId: orderItem.orderItemId, eligible: true, remainingQuantity };
}

// This line's own refund amount: (paidUnitPrice * refundQuantity) minus its
// proportional share of the coupon discount already allocated to this line.
// When refundQuantity equals the full remaining/original quantity, the
// FULL remaining coupon share is subtracted directly (not a proportional
// recomputation) — avoids ever leaving a rounding residue of the coupon
// share unaccounted for on a full-line return. A partial return instead
// takes a proportional share, rounded to 2dp, capped so a partial refund's
// coupon deduction can never exceed the line's total coupon discount.
function calculateLineRefundAmount(line: RefundRequestLine): LineRefundAmount {
  const { orderItem, refundQuantity } = line;
  const lineGrossAmount = Math.round(orderItem.paidUnitPrice * refundQuantity * 100) / 100;

  let couponShare = 0;
  if (orderItem.currency === "EGP" && orderItem.itemCouponDiscountEgp > 0) {
    couponShare =
      refundQuantity >= orderItem.quantity
        ? orderItem.itemCouponDiscountEgp
        : Math.min(
            orderItem.itemCouponDiscountEgp,
            Math.round(((orderItem.itemCouponDiscountEgp * refundQuantity) / orderItem.quantity) * 100) / 100
          );
  }

  const amount = Math.max(0, Math.round((lineGrossAmount - couponShare) * 100) / 100);

  return {
    orderItemId: orderItem.orderItemId,
    refundQuantity,
    amount,
    currency: orderItem.currency,
  };
}

function deliveryFeeRefund(
  policy: DeliveryFeeRefundPolicy,
  orderShippingFeeEgp: number,
  isFullOrderReturn: boolean
): number {
  if (policy === "refund_delivery_on_full_order_return" && isFullOrderReturn) {
    return orderShippingFeeEgp;
  }
  return 0;
}

// Throws RefundValidationError (not a discriminated-union return) the
// moment any line fails calculateItemRefundEligibility — a caller building
// a real return flow should validate every line up front with that
// function directly to show a clean per-line error instead of relying on
// this throw, but this function still refuses, by construction, to ever
// compute an amount for an over-refund.
export function calculateRefundAmount(input: RefundCalculationInput): RefundCalculationResult {
  for (const line of input.lines) {
    const eligibility = calculateItemRefundEligibility(line);
    if (!eligibility.eligible) {
      throw new RefundValidationError(
        line.orderItem.orderItemId,
        eligibility.reason!,
        `Cannot refund ${line.refundQuantity} unit(s) of order item ${line.orderItem.orderItemId}: ${eligibility.reason}`
      );
    }
  }

  const lineAmounts = input.lines.map(calculateLineRefundAmount);

  let itemsSubtotalUsd = 0;
  let itemsSubtotalEgp = 0;
  for (const line of lineAmounts) {
    if (line.currency === "USD") itemsSubtotalUsd += line.amount;
    else itemsSubtotalEgp += line.amount;
  }
  itemsSubtotalUsd = Math.round(itemsSubtotalUsd * 100) / 100;
  itemsSubtotalEgp = Math.round(itemsSubtotalEgp * 100) / 100;

  const deliveryFeeRefundEgp = deliveryFeeRefund(
    input.deliveryFeePolicy,
    input.orderShippingFeeEgp,
    input.isFullOrderReturn
  );

  return {
    lineAmounts,
    itemsSubtotalUsd,
    itemsSubtotalEgp,
    deliveryFeeRefundEgp,
    totalRefundUsd: itemsSubtotalUsd,
    totalRefundEgp: Math.round((itemsSubtotalEgp + deliveryFeeRefundEgp) * 100) / 100,
  };
}
