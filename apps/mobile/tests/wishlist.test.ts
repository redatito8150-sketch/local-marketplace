import assert from "node:assert/strict";
import test from "node:test";
import { toggleWishlistState } from "../src/domain/wishlist-state.ts";
import type { WishlistStateItem } from "../src/domain/wishlist-state.ts";

const item: WishlistStateItem = { productId: "p1", name: "Piece", brand: "Mahaly", price: 800, currency: "EGP", image: "https://example.com/p.jpg" };

test("wishlist toggle adds once, prevents duplicates, and removes", () => {
  const added = toggleWishlistState([], item);
  assert.deepEqual(added, [item]);
  assert.deepEqual(toggleWishlistState(added, item), []);
  assert.equal(toggleWishlistState([item, { ...item, productId: "p2" }], item).length, 1);
});
