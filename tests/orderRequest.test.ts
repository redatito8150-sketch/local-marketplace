import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ITEM_QUANTITY,
  MAX_ORDER_LINES,
  MAX_TOTAL_QUANTITY,
  validateOrderRequest,
} from "../lib/orders/orderRequest.ts";

const validShipping = {
  firstName: "Nour",
  lastName: "Ahmed",
  email: "nour@example.com",
  phone: "+20 100 000 0000",
  address: "10 Nile Street",
  city: "Cairo",
  governorate: "Cairo",
};

const validItem = {
  productId: "linen-shirt",
  size: "M",
  color: "Sand",
  quantity: 1,
};

test("accepts and normalizes a valid order request", () => {
  const result = validateOrderRequest({
    items: [{ ...validItem, productId: " linen-shirt ", color: " Sand " }],
    shipping: { ...validShipping, email: " nour@example.com " },
    couponCode: " summer20 ",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.items[0].productId, "linen-shirt");
  assert.equal(result.value.items[0].color, "Sand");
  assert.equal(result.value.shipping.email, "nour@example.com");
  assert.equal(result.value.couponCode, "SUMMER20");
});

test("rejects an empty cart", () => {
  assert.deepEqual(validateOrderRequest({ items: [], shipping: validShipping }), {
    ok: false,
    error: "Cart is empty",
  });
});

test("rejects too many lines", () => {
  const items = Array.from({ length: MAX_ORDER_LINES + 1 }, (_, index) => ({
    ...validItem,
    productId: `product-${index}`,
  }));
  const result = validateOrderRequest({ items, shipping: validShipping });
  assert.equal(result.ok, false);
});

test("rejects duplicate selections", () => {
  const result = validateOrderRequest({ items: [validItem, validItem], shipping: validShipping });
  assert.deepEqual(result, {
    ok: false,
    error: "Duplicate cart selections must be combined",
  });
});

test("rejects non-integer and excessive item quantities", () => {
  assert.equal(
    validateOrderRequest({ items: [{ ...validItem, quantity: 1.5 }], shipping: validShipping }).ok,
    false
  );
  assert.equal(
    validateOrderRequest({
      items: [{ ...validItem, quantity: MAX_ITEM_QUANTITY + 1 }],
      shipping: validShipping,
    }).ok,
    false
  );
});

test("rejects excessive total quantity", () => {
  const items = Array.from({ length: 4 }, (_, index) => ({
    ...validItem,
    productId: `product-${index}`,
    quantity: Math.floor(MAX_TOTAL_QUANTITY / 4) + 1,
  }));
  assert.equal(validateOrderRequest({ items, shipping: validShipping }).ok, false);
});

test("rejects malformed email and missing shipping fields", () => {
  assert.equal(
    validateOrderRequest({
      items: [validItem],
      shipping: { ...validShipping, email: "not-an-email" },
    }).ok,
    false
  );
  assert.equal(
    validateOrderRequest({
      items: [validItem],
      shipping: { ...validShipping, address: "" },
    }).ok,
    false
  );
});

test("rejects oversized coupon input", () => {
  assert.equal(
    validateOrderRequest({
      items: [validItem],
      shipping: validShipping,
      couponCode: "X".repeat(51),
    }).ok,
    false
  );
});
