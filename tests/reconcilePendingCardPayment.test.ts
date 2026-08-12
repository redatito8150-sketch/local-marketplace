import test from "node:test";
import assert from "node:assert/strict";
import { reconcilePendingCardPayment } from "../lib/payments/reconcilePendingCardPayment.ts";
import type { PurchasedCartLine } from "../types/index.ts";

function makeDeps(status: string, isPartial = false, purchasedItems: PurchasedCartLine[] = []) {
  const removedCalls: PurchasedCartLine[][] = [];
  let markerCleared = false;
  return {
    deps: {
      fetchAttemptStatus: async () => ({ ok: true as const, data: { status, isPartial, purchasedItems } }),
      removePurchasedItems: (items: PurchasedCartLine[]) => removedCalls.push(items),
      clearMarker: () => {
        markerCleared = true;
      },
    },
    removedCalls,
    wasMarkerCleared: () => markerCleared,
  };
}

const SAMPLE_ITEMS: PurchasedCartLine[] = [{ productId: "prod-1", size: "M", color: "Sand", quantity: 2 }];

test("fulfilled + not partial: removes exactly the purchased items and clears the marker", async () => {
  const { deps, removedCalls, wasMarkerCleared } = makeDeps("fulfilled", false, SAMPLE_ITEMS);
  const result = await reconcilePendingCardPayment("attempt-1", deps);
  assert.deepEqual(result, { action: "reconciled", itemsRemoved: 1 });
  assert.deepEqual(removedCalls, [SAMPLE_ITEMS]);
  assert.equal(wasMarkerCleared(), true);
});

test("fulfilled + partial: never touches the cart (no safe per-bucket mapping), but the marker is cleared since this attempt is terminal", async () => {
  const { deps, removedCalls, wasMarkerCleared } = makeDeps("fulfilled", true, []);
  const result = await reconcilePendingCardPayment("attempt-1", deps);
  assert.deepEqual(result, { action: "cleared_no_reconciliation", reason: "unreconcilable_partial" });
  assert.equal(removedCalls.length, 0);
  assert.equal(wasMarkerCleared(), true);
});

for (const status of ["failed", "expired", "cancelled", "fulfillment_failed"]) {
  test(`${status}: never touches the cart, marker is cleared (terminal failure)`, async () => {
    const { deps, removedCalls, wasMarkerCleared } = makeDeps(status);
    const result = await reconcilePendingCardPayment("attempt-1", deps);
    assert.deepEqual(result, { action: "cleared_no_reconciliation", reason: "failed" });
    assert.equal(removedCalls.length, 0);
    assert.equal(wasMarkerCleared(), true);
  });
}

for (const status of ["created", "pending", "paid", "reflecting"]) {
  test(`${status}: still in progress — cart untouched, marker kept for a later retry`, async () => {
    const { deps, removedCalls, wasMarkerCleared } = makeDeps(status);
    const result = await reconcilePendingCardPayment("attempt-1", deps);
    assert.deepEqual(result, { action: "still_pending" });
    assert.equal(removedCalls.length, 0);
    assert.equal(wasMarkerCleared(), false);
  });
}

test("a transient status-read failure leaves the marker in place for a later retry, and never touches the cart", async () => {
  let markerCleared = false;
  const removedCalls: PurchasedCartLine[][] = [];
  const result = await reconcilePendingCardPayment("attempt-1", {
    fetchAttemptStatus: async () => ({ ok: false as const }),
    removePurchasedItems: (items) => removedCalls.push(items),
    clearMarker: () => {
      markerCleared = true;
    },
  });
  assert.deepEqual(result, { action: "still_pending" });
  assert.equal(removedCalls.length, 0);
  assert.equal(markerCleared, false);
});

test("idempotent: reconciling the same fulfilled attempt twice in a row is safe (second call still reports success, cart mutation is itself idempotent)", async () => {
  const { deps, removedCalls } = makeDeps("fulfilled", false, SAMPLE_ITEMS);
  const first = await reconcilePendingCardPayment("attempt-1", deps);
  const second = await reconcilePendingCardPayment("attempt-1", deps);
  assert.deepEqual(first, { action: "reconciled", itemsRemoved: 1 });
  assert.deepEqual(second, { action: "reconciled", itemsRemoved: 1 });
  // removePurchasedItems itself is idempotent (see tests/cartStorage.test.ts)
  // — calling it twice with the same list is exactly what a caller relying
  // on this orchestrator's own idempotency would do.
  assert.equal(removedCalls.length, 2);
});
