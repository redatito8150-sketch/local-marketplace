import test from "node:test";
import assert from "node:assert/strict";
import { createPaymobIntentionForCart } from "../lib/payments/createIntentionForCart.ts";
import type {
  CreateIntentionDeps,
  CreatePaymentAttemptInput,
  CreatePaymentAttemptResult,
} from "../lib/payments/createIntentionForCart.ts";
import type { ProductLookupRow } from "../lib/payments/intentionCart.ts";
import type { ProductVariant, ShippingSettingsContent } from "../types/index.ts";

// Focused on the idempotency guarantees specifically: concurrent requests
// sharing an Idempotency-Key must never produce two Paymob intentions, and
// a request replayed against a row that never made it past 'created' (e.g.
// a genuinely concurrent race, or a resumed request after a crash) must be
// rejected exactly like one replayed against a 'pending' row — Paymob gets
// called at most once, unconditionally, per key. See
// lib/payments/createIntentionForCart.ts's "IMPORTANT AMOUNT RULE"-adjacent
// comment above that check for the reasoning.
//
// This exercises the *application-level* handling of that rule with an
// in-memory stand-in for create_payment_attempt. It does not, and cannot,
// prove real Postgres unique-index behavior under true concurrency — that
// guarantee lives in the migration SQL itself and is verified statically in
// tests/paymentAttemptsSchema.test.ts.

const AUTH = { authenticated: true as const, userId: "22222222-2222-4222-8222-222222222222" };
const ENV = { secretKey: "sk_test_secret", integrationId: "5835485" };
const IDEMPOTENCY_KEY = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";

const SHIPPING_SETTINGS: ShippingSettingsContent = {
  flatDeliveryFeeEgp: 50,
  freeShippingThresholdEgp: 1500,
  returnPolicyDays: 30,
};

function product(): ProductLookupRow {
  return {
    id: "prod-1",
    name: "Linen Shirt",
    brand_name: "Zakhnook Studio",
    brand_slug: "zakhnook-studio",
    price: 500,
    discount_percent: null,
    discount_ends_at: null,
    currency: "EGP",
    status: "published",
    publish_date: null,
    paused_by_brand: false,
    brands: { is_active: true, fulfillment_mode: "brand_fulfilled" },
    image: "https://example.com/linen-shirt.jpg",
    first_stocked_at: "2026-01-01T00:00:00.000Z",
  };
}

function variant(): ProductVariant {
  return {
    id: "variant-1",
    productId: "prod-1",
    sku: "SKU-1",
    quantity: 10,
    sellingStatus: "active",
    isArchived: false,
    optionValues: [
      { optionTypeId: "t-color", optionTypeName: "Color", optionValueId: "v-color", label: "Sand" },
      { optionTypeId: "t-size", optionTypeName: "Size", optionValueId: "v-size", label: "M" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const validBody = {
  items: [{ productId: "prod-1", size: "M", color: "Sand", quantity: 2 }],
  shipping: {
    firstName: "Nour",
    lastName: "Ahmed",
    email: "nour@example.com",
    phone: "+20 100 000 0000",
    address: "10 Nile Street",
    city: "Cairo",
    governorate: "Cairo",
  },
};

// Mirrors the migration's unique (idempotency_actor, client_request_id)
// index: whichever caller's insert "lands" first (synchronously, in this
// simulation — no `await` between the check and the set, same as the real
// unique index enforcing atomically at insert time) wins; every other
// caller for the same key gets replayed:true and must never reach Paymob.
function makeConcurrencySafeStore() {
  const byKey = new Map<string, { paymentAttemptId: string; specialReference: string; status: string; requestHash: string }>();
  let nextId = 1;

  const createPaymentAttempt = async (input: CreatePaymentAttemptInput): Promise<CreatePaymentAttemptResult> => {
    const key = `${input.idempotencyActor}::${input.clientRequestId}`;
    const existing = byKey.get(key);
    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        return { ok: false, status: 409, error: "This checkout key was already used with different order details." };
      }
      return {
        ok: true,
        paymentAttemptId: existing.paymentAttemptId,
        specialReference: existing.specialReference,
        status: existing.status,
        replayed: true,
      };
    }
    const id = `attempt-${nextId++}`;
    const row = { paymentAttemptId: id, specialReference: `mahaly_${id}`, status: "created", requestHash: input.requestHash };
    byKey.set(key, row);
    return { ok: true, paymentAttemptId: id, specialReference: row.specialReference, status: "created", replayed: false };
  };

  return { createPaymentAttempt };
}

function makeDeps(overrides: Partial<CreateIntentionDeps> = {}): { deps: CreateIntentionDeps; getCreateIntentionCalls: () => unknown[] } {
  const store = makeConcurrencySafeStore();
  const calls: unknown[] = [];
  const deps: CreateIntentionDeps = {
    fetchProducts: async () => ({ ok: true as const, rows: [product()] }),
    fetchVariants: async () => new Map([["prod-1", [variant()]]]),
    fetchBrandFlags: async () => [{ slug: "zakhnook-studio", isMahalyPartner: false }],
    fetchOpenTransitionBrandSlugs: async () => [],
    fetchShippingSettings: async () => SHIPPING_SETTINGS,
    fetchCoupon: async () => null,
    createPaymentAttempt: store.createPaymentAttempt,
    markIntentionCreated: async () => {},
    markIntentionFailed: async () => {},
    createIntention: async (payload) => {
      calls.push(payload);
      return { clientSecret: "egy_csk_test_success", intentionId: "pi_1", paymobOrderId: 1 };
    },
    now: () => new Date("2026-08-11T00:00:00.000Z"),
    ...overrides,
  };
  return { deps, getCreateIntentionCalls: () => calls };
}

test("two truly concurrent requests with the same Idempotency-Key result in exactly one Paymob call", async () => {
  const { deps, getCreateIntentionCalls } = makeDeps();

  const [first, second] = await Promise.all([
    createPaymobIntentionForCart(validBody, AUTH, IDEMPOTENCY_KEY, ENV, deps),
    createPaymobIntentionForCart(validBody, AUTH, IDEMPOTENCY_KEY, ENV, deps),
  ]);

  const outcomes = [first, second];
  const successes = outcomes.filter((o) => o.ok);
  const conflicts = outcomes.filter((o) => !o.ok);

  assert.equal(successes.length, 1, "exactly one of the two concurrent requests should succeed");
  assert.equal(conflicts.length, 1, "the other must be rejected, not silently duplicated");
  if (!conflicts[0].ok) assert.equal(conflicts[0].status, 409);

  assert.equal(getCreateIntentionCalls().length, 1, "Paymob must be called at most once for this key");
});

test("three concurrent requests with the same key still produce exactly one Paymob call", async () => {
  const { deps, getCreateIntentionCalls } = makeDeps();

  const results = await Promise.all([
    createPaymobIntentionForCart(validBody, AUTH, IDEMPOTENCY_KEY, ENV, deps),
    createPaymobIntentionForCart(validBody, AUTH, IDEMPOTENCY_KEY, ENV, deps),
    createPaymobIntentionForCart(validBody, AUTH, IDEMPOTENCY_KEY, ENV, deps),
  ]);

  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => !r.ok).length, 2);
  assert.equal(getCreateIntentionCalls().length, 1);
});

test("a request replayed against a row still at 'created' (loser of the race) is rejected, not allowed to call Paymob", async () => {
  // Explicitly exercises the fix for the gap where a replay landing before
  // the winner has reached Paymob (status still 'created') must NOT be
  // treated as safe-to-proceed.
  const store = makeConcurrencySafeStore();
  let paymobCallCount = 0;
  const deps: CreateIntentionDeps = {
    fetchProducts: async () => ({ ok: true as const, rows: [product()] }),
    fetchVariants: async () => new Map([["prod-1", [variant()]]]),
    fetchBrandFlags: async () => [{ slug: "zakhnook-studio", isMahalyPartner: false }],
    fetchOpenTransitionBrandSlugs: async () => [],
    fetchShippingSettings: async () => SHIPPING_SETTINGS,
    fetchCoupon: async () => null,
    createPaymentAttempt: store.createPaymentAttempt,
    markIntentionCreated: async () => {},
    markIntentionFailed: async () => {},
    createIntention: async () => {
      paymobCallCount += 1;
      return { clientSecret: "egy_csk_test_success", intentionId: "pi_1", paymobOrderId: 1 };
    },
    now: () => new Date("2026-08-11T00:00:00.000Z"),
  };

  // First call inserts the row (replayed: false) but we intentionally never
  // let it reach deps.createIntention by racing a second call created from
  // the same store before awaiting the first — the second call's
  // createPaymentAttempt will see the row still at 'created'.
  const firstPromise = createPaymobIntentionForCart(validBody, AUTH, IDEMPOTENCY_KEY, ENV, deps);
  const secondPromise = createPaymobIntentionForCart(validBody, AUTH, IDEMPOTENCY_KEY, ENV, deps);
  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  const rejected = [first, second].filter((o) => !o.ok);
  assert.equal(rejected.length, 1);
  if (!rejected[0].ok) assert.equal(rejected[0].status, 409);
  assert.equal(paymobCallCount, 1);
});
