import test from "node:test";
import assert from "node:assert/strict";
import { getOrderPaymentPresentation } from "../lib/orders/paymentPresentation.ts";

test("fulfilled COD is presented as collected during the migration compatibility window", () => {
  assert.deepEqual(
    getOrderPaymentPresentation({ status: "fulfilled", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid" }),
    { label: "Cash collected", detail: "Collected on delivery", tone: "success" }
  );
});

test("card and pending COD payment states remain distinct", () => {
  assert.equal(getOrderPaymentPresentation({ status: "fulfilled", paymentMethod: "card", paymentStatus: "paid" }).label, "Card paid");
  assert.equal(getOrderPaymentPresentation({ status: "shipped", paymentMethod: "cash_on_delivery", paymentStatus: "unpaid" }).label, "Collect on delivery");
});

test("a requested refund is pending until provider confirmation, while a confirmed partial refund is never shown as card-pending", () => {
  assert.deepEqual(
    getOrderPaymentPresentation({
      status: "confirmed",
      paymentMethod: "card",
      paymentStatus: "paid",
      refundPendingAmountCents: 50_00,
    }),
    { label: "Refund pending", detail: "Waiting for confirmation from the payment provider", tone: "pending" }
  );
  assert.deepEqual(
    getOrderPaymentPresentation({
      status: "confirmed",
      paymentMethod: "card",
      paymentStatus: "partially_refunded",
      refundedAmountCents: 50_00,
    }),
    { label: "Partially refunded", detail: "Part of the card payment was refunded", tone: "partial" }
  );
});
