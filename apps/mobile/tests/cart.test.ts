import assert from "node:assert/strict";
import test from "node:test";
import { addCartLine, cartLineId, clampQuantity } from "../src/domain/cart.ts";

const item = { productId: "p1", name: "Piece", brand: "Brand", image: "https://example.com/a.jpg", price: 500, currency: "EGP" as const, size: "M", color: "Black", quantity: 1 };

test("cart line identity includes product, size, and color", () => {
  assert.equal(cartLineId(item), "p1-M-Black");
});
test("duplicate selections merge and quantities are bounded", () => {
  const once = addCartLine([], item);
  assert.equal(addCartLine(once, { ...item, quantity: 20 })[0]?.quantity, 10);
  assert.equal(clampQuantity(0), 1);
});
