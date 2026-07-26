import assert from "node:assert/strict";
import test from "node:test";
import { validateCheckoutInput } from "../src/domain/checkout.ts";

const shipping = { name: "Mahaly Customer", email: "customer@example.com", address: "12 Nile Street" };

test("checkout rejects an empty cart and incomplete delivery details", () => {
  assert.equal(validateCheckoutInput(0, shipping), "Your cart is empty.");
  assert.equal(validateCheckoutInput(1, { ...shipping, address: " " }), "Complete all delivery fields before placing your order.");
  assert.equal(validateCheckoutInput(1, shipping), null);
});
