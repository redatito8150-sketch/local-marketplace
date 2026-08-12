// Pure orchestration for reconciling ONE interrupted card payment attempt
// against the current cart — every I/O dependency (the status fetch, the
// actual cart mutation, clearing the pending marker) is injected, so this
// has zero import-time dependency on fetch/DOM/sessionStorage and can be
// fully exercised in tests, the same pattern lib/payments/
// createIntentionForCart.ts and lib/payments/processPaymobWebhook.ts
// already use.
//
// This is the recovery path for exactly the interruptions the checkout
// page's own live confirmation polling (app/checkout/page.tsx) can't
// survive on its own: browser Back, a full refresh, a top-level 3DS
// redirect, or returning to Mahaly later in the same browser session. It
// is deliberately NOT a live poller itself — one status check per call,
// triggered on mount from wherever the caller wires it in (see
// context/CartContext.tsx and app/checkout/page.tsx) — the checkout
// page's own polling effect is what handles "actively watching," this is
// only the backstop for "came back after being interrupted."

import type { PurchasedCartLine } from "../../types/index.ts";

export type { PurchasedCartLine };

export interface PendingCardAttemptStatus {
  status: string;
  isPartial: boolean;
  purchasedItems: PurchasedCartLine[];
}

export interface ReconcilePendingCardPaymentDeps {
  fetchAttemptStatus: (
    paymentAttemptId: string
  ) => Promise<{ ok: true; data: PendingCardAttemptStatus } | { ok: false }>;
  removePurchasedItems: (items: PurchasedCartLine[]) => void;
  clearMarker: () => void;
}

export type ReconcilePendingCardPaymentResult =
  | { action: "reconciled"; itemsRemoved: number }
  // A real failure (failed/expired/cancelled/fulfillment_failed), or a
  // partial fulfillment this system can't safely auto-reconcile (no
  // per-bucket mapping in cart_snapshot — see the status route's own
  // comment) — either way the attempt has reached its terminal state and
  // won't resolve differently, so the marker is cleared, but the cart is
  // never touched.
  | { action: "cleared_no_reconciliation"; reason: "failed" | "unreconcilable_partial" }
  // Still created/pending/paid/reflecting, or the status read itself
  // failed transiently — the marker is deliberately left in place so a
  // later call (next mount) can retry.
  | { action: "still_pending" };

const TERMINAL_FAILURE_STATUSES = new Set(["failed", "expired", "cancelled", "fulfillment_failed"]);

export async function reconcilePendingCardPayment(
  paymentAttemptId: string,
  deps: ReconcilePendingCardPaymentDeps
): Promise<ReconcilePendingCardPaymentResult> {
  const result = await deps.fetchAttemptStatus(paymentAttemptId);
  if (!result.ok) {
    return { action: "still_pending" };
  }

  const { status, isPartial, purchasedItems } = result.data;

  if (status === "fulfilled" && !isPartial) {
    deps.removePurchasedItems(purchasedItems);
    deps.clearMarker();
    return { action: "reconciled", itemsRemoved: purchasedItems.length };
  }

  if (status === "fulfilled" && isPartial) {
    deps.clearMarker();
    return { action: "cleared_no_reconciliation", reason: "unreconcilable_partial" };
  }

  if (TERMINAL_FAILURE_STATUSES.has(status)) {
    deps.clearMarker();
    return { action: "cleared_no_reconciliation", reason: "failed" };
  }

  return { action: "still_pending" };
}
