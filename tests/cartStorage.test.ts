import test from "node:test";
import assert from "node:assert/strict";
import { applyPurchasedItemRemoval, cartStorageKey } from "../lib/cart/cartStorage.ts";
import type { CartLineItem, PurchasedCartLine } from "../types/index.ts";

function line(overrides: Partial<CartLineItem> = {}): CartLineItem {
  return {
    id: "prod-1-M-Sand",
    productId: "prod-1",
    brandSlug: "zakhnook-studio",
    name: "Linen Shirt",
    brand: "Zakhnook Studio",
    price: 500,
    currency: "EGP",
    image: "img.png",
    size: "M",
    color: "Sand",
    quantity: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// cartStorageKey — the identity -> storage key mapping cross-account
// isolation is built on (context/CartContext.tsx re-hydrates from this
// key whenever it changes).
// ---------------------------------------------------------------------

test("cartStorageKey: two different authenticated users always get different, non-overlapping keys", () => {
  const userA = cartStorageKey("11111111-1111-4111-8111-111111111111");
  const userB = cartStorageKey("22222222-2222-4222-8222-222222222222");
  assert.notEqual(userA, userB);
});

test("cartStorageKey: the guest (signed-out) scope is stable and distinct from every authenticated user's scope", () => {
  const guest1 = cartStorageKey(null);
  const guest2 = cartStorageKey(null);
  const userA = cartStorageKey("11111111-1111-4111-8111-111111111111");
  assert.equal(guest1, guest2);
  assert.notEqual(guest1, userA);
});

test("cartStorageKey: the same user id always maps back to the same key — a user's own cart round-trips across logout/login", () => {
  const first = cartStorageKey("11111111-1111-4111-8111-111111111111");
  const second = cartStorageKey("11111111-1111-4111-8111-111111111111");
  assert.equal(first, second);
});

test("cartStorageKey: never reuses the old pre-fix fixed key ('local_cart_v1') for any identity, guest included", () => {
  assert.notEqual(cartStorageKey(null), "local_cart_v1");
  assert.notEqual(cartStorageKey("11111111-1111-4111-8111-111111111111"), "local_cart_v1");
});

// ---------------------------------------------------------------------
// applyPurchasedItemRemoval — the precise, non-destructive reconciliation
// used instead of a blind clearCart() (see app/checkout/page.tsx and
// lib/payments/reconcilePendingCardPayment.ts).
// ---------------------------------------------------------------------

test("removes exactly the purchased quantity from a matching line, leaving the remainder", () => {
  const items = [line({ quantity: 5 })];
  const purchased: PurchasedCartLine[] = [{ productId: "prod-1", size: "M", color: "Sand", quantity: 2 }];
  const result = applyPurchasedItemRemoval(items, purchased);
  assert.equal(result.length, 1);
  assert.equal(result[0].quantity, 3);
});

test("removes the whole line once its purchased quantity meets or exceeds what's in the cart", () => {
  const items = [line({ quantity: 2 })];
  const purchased: PurchasedCartLine[] = [{ productId: "prod-1", size: "M", color: "Sand", quantity: 2 }];
  assert.deepEqual(applyPurchasedItemRemoval(items, purchased), []);

  const overPurchased: PurchasedCartLine[] = [{ productId: "prod-1", size: "M", color: "Sand", quantity: 9 }];
  assert.deepEqual(applyPurchasedItemRemoval(items, overPurchased), []);
});

test("never touches lines that don't match productId+size+color, even for the same product — the 'cart B' scenario", () => {
  // Customer pays for cart A (the Sand/M shirt), then before reconciliation
  // runs adds a second, different line of the SAME product to their cart
  // (a different color). The purchase must never remove it.
  const cartB = line({ id: "prod-1-M-Navy", color: "Navy", quantity: 1 });
  const items = [line({ quantity: 2 }), cartB];
  const purchased: PurchasedCartLine[] = [{ productId: "prod-1", size: "M", color: "Sand", quantity: 2 }];
  const result = applyPurchasedItemRemoval(items, purchased);
  assert.deepEqual(result, [cartB]);
});

test("never touches an entirely unrelated product added after the purchase", () => {
  const unrelated = line({ id: "prod-2-L-Blue", productId: "prod-2", size: "L", color: "Blue", quantity: 1 });
  const items = [line({ quantity: 2 }), unrelated];
  const purchased: PurchasedCartLine[] = [{ productId: "prod-1", size: "M", color: "Sand", quantity: 2 }];
  const result = applyPurchasedItemRemoval(items, purchased);
  assert.deepEqual(result, [unrelated]);
});

test("matches a colorless line correctly whether the purchased record's color is an empty string", () => {
  const colorless = line({ id: "prod-3-L-default", productId: "prod-3", size: "L", color: undefined, quantity: 1 });
  const purchased: PurchasedCartLine[] = [{ productId: "prod-3", size: "L", color: "", quantity: 1 }];
  assert.deepEqual(applyPurchasedItemRemoval([colorless], purchased), []);
});

test("is idempotent — calling it again after the matching quantity is already gone is a safe no-op", () => {
  const items = [line({ quantity: 2 })];
  const purchased: PurchasedCartLine[] = [{ productId: "prod-1", size: "M", color: "Sand", quantity: 2 }];
  const once = applyPurchasedItemRemoval(items, purchased);
  const twice = applyPurchasedItemRemoval(once, purchased);
  assert.deepEqual(once, twice);
  assert.deepEqual(twice, []);
});

test("an empty purchased list changes nothing", () => {
  const items = [line()];
  assert.deepEqual(applyPurchasedItemRemoval(items, []), items);
});

test("removes multiple distinct purchased lines from a multi-brand cart in one call", () => {
  const shirt = line({ quantity: 3 });
  const pants = line({ id: "prod-9-32-Black", productId: "prod-9", size: "32", color: "Black", quantity: 1 });
  const items = [shirt, pants];
  const purchased: PurchasedCartLine[] = [
    { productId: "prod-1", size: "M", color: "Sand", quantity: 1 },
    { productId: "prod-9", size: "32", color: "Black", quantity: 1 },
  ];
  const result = applyPurchasedItemRemoval(items, purchased);
  assert.equal(result.length, 1);
  assert.equal(result[0].productId, "prod-1");
  assert.equal(result[0].quantity, 2);
});
