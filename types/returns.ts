// Types for the refund-calculation layer (lib/returns/refundCalculation.ts).
// Deliberately separate from types/index.ts's OrderItemRecord — a return
// line only ever needs the historical pricing snapshot fields, not the
// display-oriented shape (image, brand name, etc.) the rest of the app
// uses. No live return workflow exists yet; this is the calculation layer
// only (types + pure functions), per the explicit scope for this branch —
// see lib/returns/refundCalculation.ts's own header comment.

// Whichever this line's discount actually was — mirrors
// OrderItemDiscountSource in types/index.ts, redeclared here so this file
// has zero import dependency on the rest of the app (same "pure,
// injectable" convention already used by lib/payments/intentionCart.ts).
export type RefundDiscountSource = "product_discount" | "variant_discount" | "none";

// The historical snapshot for one order_items row — exactly the fields a
// refund can be computed from, and nothing else. Never fetched fresh from
// a product; always read as-is from a real order_items row.
export interface OrderItemSnapshot {
  orderItemId: string;
  quantity: number;
  // Unit price actually paid, after any product/variant discount, before
  // a coupon (order_items.price — always present, even on historical rows
  // predating this migration).
  paidUnitPrice: number;
  currency: "USD" | "EGP";
  // This line's own total (not per-unit) share of the order's coupon
  // discount, in EGP. Always 0 for USD lines and for historical rows
  // (order_items.item_coupon_discount_egp, default 0).
  itemCouponDiscountEgp: number;
}

// One requested return line: which order_items row, how many of the
// originally-purchased units, and how many of that same row have already
// been refunded in an earlier, separate return (0 if this is the first).
export interface RefundRequestLine {
  orderItem: OrderItemSnapshot;
  refundQuantity: number;
  alreadyRefundedQuantity: number;
}

export interface LineRefundEligibility {
  orderItemId: string;
  eligible: boolean;
  // Present only when eligible is false.
  reason?: "EXCEEDS_PURCHASED_QUANTITY" | "EXCEEDS_REMAINING_QUANTITY" | "INVALID_QUANTITY";
  remainingQuantity: number;
}

export interface LineRefundAmount {
  orderItemId: string;
  refundQuantity: number;
  // (paidUnitPrice * refundQuantity) - this line's proportional share of
  // itemCouponDiscountEgp for the returned units, rounded to 2dp. Currency
  // matches the order_item's own (USD lines are never discounted by a
  // coupon, so their amount is always simply paidUnitPrice * quantity).
  amount: number;
  currency: "USD" | "EGP";
}

// Deliberately a named policy, not a boolean or a hardcoded rule — a real
// delivery-fee refund decision is a pending business call (see
// CLAUDE.local.md / the Zakhnook Project Bible's Returns & Refunds spec),
// not something to bake in here. Extensible: a new policy value can be
// added later without changing calculateRefundAmount's signature.
export type DeliveryFeeRefundPolicy =
  | "never_refund_delivery"
  | "refund_delivery_on_full_order_return";

export interface RefundCalculationInput {
  lines: RefundRequestLine[];
  // Only consulted when deliveryFeePolicy is
  // "refund_delivery_on_full_order_return" — the order's own delivery fee
  // and whether every unit across the whole order (not just this refund
  // request) is being returned.
  orderShippingFeeEgp: number;
  isFullOrderReturn: boolean;
  deliveryFeePolicy: DeliveryFeeRefundPolicy;
}

export interface RefundCalculationResult {
  lineAmounts: LineRefundAmount[];
  itemsSubtotalUsd: number;
  itemsSubtotalEgp: number;
  deliveryFeeRefundEgp: number;
  totalRefundUsd: number;
  totalRefundEgp: number;
}
