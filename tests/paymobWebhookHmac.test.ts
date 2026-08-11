import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildTransactionHmacString,
  computeTransactionHmac,
  verifyTransactionHmac,
  categorizeDeclineReason,
} from "../lib/payments/paymobWebhook.ts";
import type { PaymobTransactionObject } from "../lib/payments/paymobWebhook.ts";

const SECRET = "test_hmac_secret";

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

test("buildTransactionHmacString concatenates the 20 documented fields in the exact documented order", () => {
  const object = txn();
  const built = buildTransactionHmacString(object);

  // Manually build the expected string in the documented order to prove
  // the function isn't just concatenating in object-declaration order.
  const expected =
    "105000" + // amount_cents
    "2026-08-12T10:00:00.000000" + // created_at
    "EGP" + // currency
    "false" + // error_occured
    "false" + // has_parent_transaction
    "2556706" + // id
    "5835485" + // integration_id
    "true" + // is_3d_secure
    "false" + // is_auth
    "false" + // is_capture
    "false" + // is_refunded
    "true" + // is_standalone_payment
    "false" + // is_voided
    "445566" + // order.id
    "998877" + // owner
    "false" + // pending
    "2081" + // source_data.pan
    "MasterCard" + // source_data.sub_type
    "card" + // source_data.type
    "true"; // success

  assert.equal(built, expected);
});

test("booleans become lowercase 'true'/'false' strings, never 1/0 or Python-style casing", () => {
  const built = buildTransactionHmacString(txn({ error_occured: true, success: false }));
  assert.match(built, /true/);
  assert.match(built, /false/);
  assert.doesNotMatch(built, /True|False/);
});

test("missing nested fields (order, source_data) become empty strings, not 'null' or 'undefined'", () => {
  const built = buildTransactionHmacString(txn({ order: null, source_data: null }));
  assert.doesNotMatch(built, /null/i);
  assert.doesNotMatch(built, /undefined/);
});

test("computeTransactionHmac matches an independently-computed SHA512 HMAC over the same string", () => {
  const object = txn();
  const expected = createHmac("sha512", SECRET).update(buildTransactionHmacString(object)).digest("hex");
  assert.equal(computeTransactionHmac(object, SECRET), expected);
  assert.match(computeTransactionHmac(object, SECRET), /^[0-9a-f]{128}$/); // SHA-512 hex digest length
});

test("changing any single field changes the computed HMAC (order/field sensitivity)", () => {
  const base = computeTransactionHmac(txn(), SECRET);
  assert.notEqual(computeTransactionHmac(txn({ amount_cents: 105001 }), SECRET), base);
  assert.notEqual(computeTransactionHmac(txn({ success: false }), SECRET), base);
  assert.notEqual(computeTransactionHmac(txn({ order: { id: 999999 } }), SECRET), base);
  assert.notEqual(computeTransactionHmac(txn(), "different_secret"), base);
});

test("verifyTransactionHmac accepts a correctly-computed hmac and rejects everything else", () => {
  const object = txn();
  const correct = computeTransactionHmac(object, SECRET);

  assert.equal(verifyTransactionHmac(object, correct, SECRET), true);
  assert.equal(verifyTransactionHmac(object, correct, "wrong_secret"), false);
  assert.equal(verifyTransactionHmac(object, correct.slice(0, -2) + "00", SECRET), false);
  assert.equal(verifyTransactionHmac(object, null, SECRET), false);
  assert.equal(verifyTransactionHmac(object, undefined, SECRET), false);
  assert.equal(verifyTransactionHmac(object, "", SECRET), false);
  assert.equal(verifyTransactionHmac(object, "not-valid-hex!!", SECRET), false);
});

test("verifyTransactionHmac rejects a tampered payload even though the received hmac is unchanged (the actual forgery scenario)", () => {
  const original = txn({ amount_cents: 100 });
  const correctHmacForOriginal = computeTransactionHmac(original, SECRET);
  const tampered = txn({ amount_cents: 100000000 }); // attacker inflates/deflates the amount
  assert.equal(verifyTransactionHmac(tampered, correctHmacForOriginal, SECRET), false);
});

test("categorizeDeclineReason never leaks raw provider text, only safe categories", () => {
  assert.equal(categorizeDeclineReason(txn({ is_voided: true })), "paymob_transaction_voided");
  assert.equal(categorizeDeclineReason(txn({ is_refunded: true })), "paymob_transaction_refunded");
  assert.equal(categorizeDeclineReason(txn({ error_occured: true })), "paymob_transaction_error");
  assert.equal(categorizeDeclineReason(txn({ success: false })), "card_declined");
});
