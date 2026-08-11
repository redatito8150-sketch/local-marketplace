// Paymob "Transaction Processed" webhook — HMAC verification.
//
// IMPORTANT — verification status: official Paymob documentation
// (docs.paymob.com/docs/hmac-calculation, developers.paymob.com/paymob-docs/
// developers/webhook-callbacks-and-hmac) could not be fetched directly in
// this environment — every route redirects to a JS-rendered docs app that
// returns an empty shell to automated fetching, and the direct developers.
// paymob.com host returns 403. The field list, order, and algorithm below
// are corroborated by multiple independent sources instead: Paymob's own
// Pakistan/Oman/KSA regional doc mirrors (same docs platform, same
// content), which agree with each other verbatim, and the list is
// internally self-consistent (it is exactly the 20 field names/paths in
// alphabetical order, matching the documented "sort keys lexicographically"
// rule). This has NOT been verified against a real Paymob sandbox webhook
// payload — that is the single highest-priority thing to check before this
// goes anywhere near a live integration. See the Phase 3 report for the
// full list of sources checked.
//
// The 20 fields, in the exact order Paymob's docs specify (this order is
// load-bearing — HMAC is order-sensitive):
//   amount_cents, created_at, currency, error_occured, has_parent_transaction,
//   id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded,
//   is_standalone_payment, is_voided, order.id, owner, pending,
//   source_data.pan, source_data.sub_type, source_data.type, success
//
// Delivered as a `hmac` query-string parameter on the webhook POST request
// (confirmed consistently across every source checked) — never in the JSON
// body itself.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface PaymobTransactionObject {
  id: number | string;
  amount_cents: number | string;
  created_at: string;
  currency: string;
  error_occured: boolean;
  has_parent_transaction: boolean;
  integration_id: number | string;
  is_3d_secure: boolean;
  is_auth: boolean;
  is_capture: boolean;
  is_refunded: boolean;
  is_standalone_payment: boolean;
  is_voided: boolean;
  order?: { id?: number | string } | null;
  owner: number | string;
  pending: boolean;
  source_data?: { pan?: string | null; sub_type?: string | null; type?: string | null } | null;
  success: boolean;
}

// Order matters — this is the literal HMAC concatenation order, not just a
// list of fields to validate presence of.
const HMAC_FIELD_ORDER: ReadonlyArray<(obj: PaymobTransactionObject) => unknown> = [
  (o) => o.amount_cents,
  (o) => o.created_at,
  (o) => o.currency,
  (o) => o.error_occured,
  (o) => o.has_parent_transaction,
  (o) => o.id,
  (o) => o.integration_id,
  (o) => o.is_3d_secure,
  (o) => o.is_auth,
  (o) => o.is_capture,
  (o) => o.is_refunded,
  (o) => o.is_standalone_payment,
  (o) => o.is_voided,
  (o) => o.order?.id,
  (o) => o.owner,
  (o) => o.pending,
  (o) => o.source_data?.pan,
  (o) => o.source_data?.sub_type,
  (o) => o.source_data?.type,
  (o) => o.success,
];

// Booleans -> lowercase "true"/"false"; null/undefined -> ""; everything
// else -> its plain string form. This is the near-universal convention
// across every payment-gateway HMAC scheme of this shape and matches how
// every source describing Paymob's own calculation phrases it ("the
// values of the keys concatenated") — but is one of the specific details
// that couldn't be confirmed against real Paymob source code (see the
// module-level note above).
function toHmacString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

export function buildTransactionHmacString(obj: PaymobTransactionObject): string {
  return HMAC_FIELD_ORDER.map((getField) => toHmacString(getField(obj))).join("");
}

export function computeTransactionHmac(obj: PaymobTransactionObject, hmacSecret: string): string {
  return createHmac("sha512", hmacSecret).update(buildTransactionHmacString(obj)).digest("hex");
}

// Constant-time comparison — a plain `===` here would let an attacker
// measure response-time differences to brute-force the HMAC byte by byte.
// Falls back to a definite `false` (never throws) on any malformed input,
// e.g. a received value that isn't valid hex or isn't the expected length.
export function verifyTransactionHmac(
  obj: PaymobTransactionObject,
  receivedHmac: string | null | undefined,
  hmacSecret: string
): boolean {
  if (!receivedHmac) return false;
  const expected = computeTransactionHmac(obj, hmacSecret);
  const expectedBuffer = Buffer.from(expected.toLowerCase(), "hex");
  let receivedBuffer: Buffer;
  try {
    receivedBuffer = Buffer.from(receivedHmac.toLowerCase(), "hex");
  } catch {
    return false;
  }
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

// A safe, categorized failure reason — never the raw Paymob decline
// message, which can vary in wording/language and isn't guaranteed safe
// to show verbatim. Mirrors categorizePaymobFailure in
// lib/payments/createIntentionForCart.ts for the same reasons.
export function categorizeDeclineReason(txn: PaymobTransactionObject): string {
  if (txn.is_voided) return "paymob_transaction_voided";
  if (txn.is_refunded) return "paymob_transaction_refunded";
  if (txn.error_occured) return "paymob_transaction_error";
  return "card_declined";
}
