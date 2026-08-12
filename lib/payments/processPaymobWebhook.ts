// Pure orchestration for the (HMAC-already-verified) Paymob "Transaction
// Processed" webhook — mirrors the same "pure orchestrator + injected deps"
// shape as lib/payments/createIntentionForCart.ts, for the same reason:
// fully unit-testable without a live database.
//
// HMAC verification itself happens in the route, BEFORE this function is
// ever called (see lib/payments/paymobWebhook.ts) — this file assumes the
// transaction object it's given is already authenticated. It only ever
// decides which of two durable, idempotent RPCs to call
// (mark_payment_attempt_paid / mark_payment_attempt_declined), then — only
// for a successful payment — calls place_paid_order as a SEPARATE
// subsequent call. Those two calls are deliberately never combined into
// one: mark_payment_attempt_paid commits independently, so a crash or
// exception inside place_paid_order can never roll back the paid fact
// already recorded. See the Phase 3 migration's module comment for the
// full invariant.

import type { PaymobTransactionObject } from "./paymobWebhook.ts";
import { categorizeDeclineReason } from "./paymobWebhook.ts";

export interface MarkPaidResult {
  status: string;
  replayed: boolean;
}

export interface MarkDeclinedResult {
  status: string;
  replayed: boolean;
}

export interface PlacePaidOrderResult {
  status: "fulfilled" | "fulfillment_failed";
  masterOrderId: string | null;
  isPartial: boolean;
  replayed: boolean;
}

export interface ProcessWebhookDeps {
  findPaymentAttemptIdByProviderOrderId: (providerOrderId: string) => Promise<string | null>;
  markPaid: (input: {
    paymentAttemptId: string;
    providerTransactionId: string;
    providerEventId: string;
    amountCents: number;
    currency: string;
  }) => Promise<MarkPaidResult>;
  markDeclined: (input: {
    paymentAttemptId: string;
    providerTransactionId: string;
    providerEventId: string;
    failureReason: string;
  }) => Promise<MarkDeclinedResult>;
  placePaidOrder: (paymentAttemptId: string) => Promise<PlacePaidOrderResult>;
}

export type ProcessWebhookOutcome =
  | { ok: true; action: "paid_and_fulfilled"; paymentAttemptId: string; result: PlacePaidOrderResult }
  | { ok: true; action: "declined"; paymentAttemptId: string; result: MarkDeclinedResult }
  | { ok: true; action: "pending_acknowledged" }
  | { ok: false; status: number; reason: string };

export async function processPaymobWebhook(
  txn: PaymobTransactionObject,
  deps: ProcessWebhookDeps
): Promise<ProcessWebhookOutcome> {
  const providerOrderId = txn.order?.id != null ? String(txn.order.id) : null;
  if (!providerOrderId) {
    return { ok: false, status: 400, reason: "MISSING_ORDER_ID" };
  }

  const paymentAttemptId = await deps.findPaymentAttemptIdByProviderOrderId(providerOrderId);
  if (!paymentAttemptId) {
    return { ok: false, status: 404, reason: "PAYMENT_ATTEMPT_NOT_FOUND" };
  }

  const providerEventId = String(txn.id);
  const providerTransactionId = String(txn.id);

  // "processing"/pending is reserved for a future async payment method (see
  // the approved architecture's lifecycle review) — Paymob VPC/Card is a
  // synchronous capture flow with no confirmed intermediate webhook state.
  // Acknowledge and do nothing rather than guess at a transition that has
  // no wired RPC to call yet.
  if (txn.pending) {
    return { ok: true, action: "pending_acknowledged" };
  }

  if (txn.success) {
    const amountCents = Math.round(Number(txn.amount_cents));
    const markPaidResult = await deps.markPaid({
      paymentAttemptId,
      providerTransactionId,
      providerEventId,
      amountCents,
      currency: txn.currency,
    });

    // Whether this call actually transitioned the row just now or was a
    // replay of an already-paid attempt, always (re)attempt fulfillment —
    // place_paid_order is itself idempotent (per-bucket, via the ledger's
    // unique constraint) and short-circuits instantly if already finished.
    // This is what makes bucket fulfillment safely retryable across
    // repeated webhook deliveries, not just the paid transition itself.
    void markPaidResult;
    const placeResult = await deps.placePaidOrder(paymentAttemptId);
    return { ok: true, action: "paid_and_fulfilled", paymentAttemptId, result: placeResult };
  }

  const declinedResult = await deps.markDeclined({
    paymentAttemptId,
    providerTransactionId,
    providerEventId,
    failureReason: categorizeDeclineReason(txn),
  });
  return { ok: true, action: "declined", paymentAttemptId, result: declinedResult };
}
