import test from "node:test";
import assert from "node:assert/strict";
import { processPaymobWebhook } from "../lib/payments/processPaymobWebhook.ts";
import type { ProcessWebhookDeps } from "../lib/payments/processPaymobWebhook.ts";
import type { PaymobTransactionObject } from "../lib/payments/paymobWebhook.ts";

function txn(overrides: Partial<PaymobTransactionObject> = {}): PaymobTransactionObject {
  return {
    id: 2556706,
    amount_cents: 105000,
    created_at: "2026-08-12T10:00:00.000000",
    currency: "EGP",
    error_occured: false,
    has_parent_transaction: false,
    integration_id: 5835485,
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: { id: 445566 },
    owner: 998877,
    pending: false,
    source_data: { pan: "2081", sub_type: "MasterCard", type: "card" },
    success: true,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ProcessWebhookDeps> = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  const deps: ProcessWebhookDeps = {
    findPaymentAttemptIdByProviderOrderId: async (providerOrderId) => {
      calls.push({ fn: "find", args: providerOrderId });
      return "attempt-1";
    },
    markPaid: async (input) => {
      calls.push({ fn: "markPaid", args: input });
      return { status: "paid", replayed: false };
    },
    markDeclined: async (input) => {
      calls.push({ fn: "markDeclined", args: input });
      return { status: "failed", replayed: false };
    },
    placePaidOrder: async (paymentAttemptId) => {
      calls.push({ fn: "placePaidOrder", args: paymentAttemptId });
      return { status: "fulfilled", masterOrderId: "group-1", isPartial: false, replayed: false };
    },
    ...overrides,
  };
  return { deps, calls };
}

test("a successful, non-pending transaction marks paid, then always calls place_paid_order", async () => {
  const { deps, calls } = makeDeps();
  const outcome = await processPaymobWebhook(txn(), deps);
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.action, "paid_and_fulfilled");
    assert.equal(outcome.paymentAttemptId, "attempt-1");
  }
  assert.deepEqual(
    calls.map((c) => c.fn),
    ["find", "markPaid", "placePaidOrder"]
  );
});

test("markPaid is called with the exact amount/currency/transaction id from the transaction object", async () => {
  const { deps, calls } = makeDeps();
  await processPaymobWebhook(txn({ amount_cents: 250000, currency: "EGP", id: 999 }), deps);
  const markPaidCall = calls.find((c) => c.fn === "markPaid")!;
  assert.deepEqual(markPaidCall.args, {
    paymentAttemptId: "attempt-1",
    providerTransactionId: "999",
    providerEventId: "999",
    amountCents: 250000,
    currency: "EGP",
  });
});

test("place_paid_order is called even when markPaid reports a replay (retry-safe fulfillment, not skipped on replay)", async () => {
  const { deps, calls } = makeDeps({
    markPaid: async () => ({ status: "paid", replayed: true }),
  });
  await processPaymobWebhook(txn(), deps);
  assert.ok(calls.some((c) => c.fn === "placePaidOrder"));
});

test("a declined (success: false) transaction calls markDeclined and never calls placePaidOrder", async () => {
  const { deps, calls } = makeDeps();
  const outcome = await processPaymobWebhook(txn({ success: false }), deps);
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal(outcome.action, "declined");
  assert.deepEqual(
    calls.map((c) => c.fn),
    ["find", "markDeclined"]
  );
  assert.ok(!calls.some((c) => c.fn === "placePaidOrder"));
  assert.ok(!calls.some((c) => c.fn === "markPaid"));
});

test("markDeclined receives a safe categorized failure reason, never raw transaction data", async () => {
  const { deps, calls } = makeDeps();
  await processPaymobWebhook(txn({ success: false, is_voided: true }), deps);
  const declinedCall = calls.find((c) => c.fn === "markDeclined")!;
  assert.equal((declinedCall.args as { failureReason: string }).failureReason, "paymob_transaction_voided");
});

test("a pending transaction is acknowledged without transitioning any state (processing is reserved, not wired)", async () => {
  const { deps, calls } = makeDeps();
  const outcome = await processPaymobWebhook(txn({ pending: true }), deps);
  assert.equal(outcome.ok, true);
  if (outcome.ok) assert.equal(outcome.action, "pending_acknowledged");
  assert.deepEqual(
    calls.map((c) => c.fn),
    ["find"]
  );
});

test("a transaction with no matching payment_attempts row is rejected with 404, no writes attempted", async () => {
  const { deps, calls } = makeDeps({
    findPaymentAttemptIdByProviderOrderId: async (providerOrderId) => {
      calls.push({ fn: "find", args: providerOrderId });
      return null;
    },
  });
  const outcome = await processPaymobWebhook(txn(), deps);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.status, 404);
  assert.deepEqual(
    calls.map((c) => c.fn),
    ["find"]
  );
});

test("a transaction with no order.id is rejected with 400 before any lookup", async () => {
  const { deps, calls } = makeDeps();
  const outcome = await processPaymobWebhook(txn({ order: null }), deps);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.status, 400);
  assert.equal(calls.length, 0);
});
