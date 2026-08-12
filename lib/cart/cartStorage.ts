// Pure cart-storage logic extracted out of context/CartContext.tsx so it
// can be unit-tested with real function calls (no React, no DOM) — the
// same "pure logic in lib/, thin React wrapper in context/" split already
// used for lib/payments/cardPaymentAttempt.ts's reducer.

import type { CartLineItem, PurchasedCartLine } from "../../types/index.ts";

// Scoped per authenticated identity so two different accounts signing in
// on the same browser never see each other's cart — the previous single
// fixed key ("local_cart_v1") was shared across every account on the
// browser, a real cross-account data leak. "guest" is its own stable
// scope for a signed-out visitor, kept separate from that old fixed key
// on purpose: its prior contents could belong to any account that was
// ever signed in on this browser, so it is deliberately never read again
// (not migrated into any scope) rather than risk attaching one account's
// leftover cart to another.
export function cartStorageKey(userId: string | null): string {
  return `mahaly_cart:${userId ?? "guest"}`;
}

// Removes exactly the given quantities (decrementing, not just deleting
// the whole line) of matching productId+size+color entries from `items`
// — anything else, including lines added after the purchase `purchased`
// came from, is returned completely untouched. The safe alternative to
// wiping the whole cart when reconciling one specific confirmed purchase
// (see app/checkout/page.tsx and lib/payments/
// reconcilePendingCardPayment.ts for why a blind clear is unsafe there).
// Naturally idempotent: calling it again with the same `purchased` list
// once those quantities are already gone from `items` is a no-op.
export function applyPurchasedItemRemoval(
  items: CartLineItem[],
  purchased: PurchasedCartLine[]
): CartLineItem[] {
  if (purchased.length === 0) return items;
  let next = items;
  for (const line of purchased) {
    next = next
      .map((i) => {
        if (
          i.productId !== line.productId ||
          i.size !== line.size ||
          (i.color ?? "") !== (line.color ?? "")
        ) {
          return i;
        }
        const remaining = i.quantity - line.quantity;
        return remaining > 0 ? { ...i, quantity: remaining } : null;
      })
      .filter((i): i is CartLineItem => i !== null);
  }
  return next;
}
