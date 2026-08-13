import test from "node:test";
import assert from "node:assert/strict";
import { createPaymobIntentionForCart } from "../lib/payments/createIntentionForCart.ts";
import { PaymobApiError } from "../lib/payments/paymob.ts";
import type {
  CreateIntentionDeps,
  CreatePaymentAttemptInput,
  CreatePaymentAttemptResult,
} from "../lib/payments/createIntentionForCart.ts";
import type { ProductLookupRow } from "../lib/payments/intentionCart.ts";
import type { ProductVariant, ShippingSettingsContent } from "../types/index.ts";

const AUTH = { authenticated: true as const, userId: "11111111-1111-4111-8111-111111111111" };
const ENV = { secretKey: "sk_test_secret", integrationId: "5835485" };
const VALID_IDEMPOTENCY_KEY = "550e8400-e29b-41d4-a716-446655440000";

const SHIPPING_SETTINGS: ShippingSettingsContent = {
  flatDeliveryFeeEgp: 50,
  freeShippingThresholdEgp: 1500,
  returnPolicyDays: 30,
};

function product(overrides: Partial<ProductLookupRow> = {}): ProductLookupRow {
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
    ...overrides,
  };
}

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
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
    ...overrides,
  };
}

const validShipping = {
  firstName: "Nour",
  lastName: "Ahmed",
  email: "nour@example.com",
  phone: "+20 100 000 0000",
  address: "10 Nile Street",
  city: "Cairo",
  governorate: "Cairo",
};

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ productId: "prod-1", size: "M", color: "Sand", quantity: 2 }],
    shipping: validShipping,
    ...overrides,
  };
}

// A minimal in-memory stand-in for the real create_payment_attempt /
// mark_paymob_intention_created / mark_paymob_intention_failed RPCs — good
// enough to prove the *application-level* idempotent-handling logic
// (which mirrors the database's own unique-index + CAS design, verified
// separately in tests/paymentAttemptsSchema.test.ts against the actual
// migration SQL). Not a substitute for testing real Postgres concurrency.
function makeFakeAttemptStore() {
  interface Row {
    paymentAttemptId: string;
    specialReference: string;
    status: string;
    requestHash: string;
    amountCents: number;
    userId: string;
    providerIntentionId?: string;
    providerOrderId?: number;
    failureReason?: string;
  }

  const byKey = new Map<string, Row>();
  const byId = new Map<string, Row>();
  let nextId = 1;

  const createPaymentAttempt = async (input: CreatePaymentAttemptInput): Promise<CreatePaymentAttemptResult> => {
    const key = `${input.idempotencyActor}::${input.clientRequestId}`;
    const existing = byKey.get(key);
    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        return {
          ok: false,
          status: 409,
          error: "This checkout key was already used with different order details.",
        };
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
    const row: Row = {
      paymentAttemptId: id,
      specialReference: `mahaly_${id}`,
      status: "created",
      requestHash: input.requestHash,
      amountCents: input.amountCents,
      userId: input.userId,
    };
    byKey.set(key, row);
    byId.set(id, row);
    return { ok: true, paymentAttemptId: id, specialReference: row.specialReference, status: "created", replayed: false };
  };

  const markIntentionCreated = async (paymentAttemptId: string, providerIntentionId: string, providerOrderId: number) => {
    const row = byId.get(paymentAttemptId);
    if (!row) throw new Error("PAYMENT_ATTEMPT_NOT_FOUND");
    if (row.status !== "created") throw new Error("PAYMENT_ATTEMPT_STATUS_CONFLICT");
    row.status = "pending";
    row.providerIntentionId = providerIntentionId;
    row.providerOrderId = providerOrderId;
  };

  const markIntentionFailed = async (paymentAttemptId: string, failureReason: string) => {
    const row = byId.get(paymentAttemptId);
    if (!row) throw new Error("PAYMENT_ATTEMPT_NOT_FOUND");
    if (row.status !== "created") throw new Error("PAYMENT_ATTEMPT_STATUS_CONFLICT");
    row.status = "failed";
    row.failureReason = failureReason;
  };

  return { byId, createPaymentAttempt, markIntentionCreated, markIntentionFailed };
}

function makeDeps(overrides: Partial<CreateIntentionDeps> = {}) {
  const store = makeFakeAttemptStore();
  const createIntentionCalls: unknown[] = [];
  const deps: CreateIntentionDeps = {
    fetchProducts: async () => ({ ok: true as const, rows: [product()] }),
    fetchVariants: async () => new Map([["prod-1", [variant()]]]),
    fetchBrandFlags: async () => [{ slug: "zakhnook-studio", isMahalyPartner: false }],
    fetchOpenTransitionBrandSlugs: async () => [],
    fetchShippingSettings: async () => SHIPPING_SETTINGS,
    createPaymentAttempt: store.createPaymentAttempt,
    markIntentionCreated: store.markIntentionCreated,
    markIntentionFailed: store.markIntentionFailed,
    createIntention: async (payload) => {
      createIntentionCalls.push(payload);
      return { clientSecret: "egy_csk_test_success", intentionId: "pi_1", paymobOrderId: 1 };
    },
    now: () => new Date("2026-08-11T00:00:00.000Z"),
    ...overrides,
  };
  return { deps, store, getCreateIntentionCalls: () => createIntentionCalls };
}

test("rejects a missing Idempotency-Key header without touching the cart/DB", async () => {
  const { deps } = makeDeps({
    fetchProducts: async () => {
      throw new Error("should not be called");
    },
  });
  const outcome = await createPaymobIntentionForCart(validBody(), AUTH, null, ENV, deps);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.status, 400);
});

test("rejects a malformed Idempotency-Key header", async () => {
  const { deps } = makeDeps({
    fetchProducts: async () => {
      throw new Error("should not be called");
    },
  });
  const outcome = await createPaymobIntentionForCart(validBody(), AUTH, "not-a-uuid", ENV, deps);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.status, 400);
});

test("rejects an unauthenticated request, checked after the Idempotency-Key format", async () => {
  const { deps } = makeDeps({
    fetchProducts: async () => {
      throw new Error("should not be called");
    },
  });
  const outcome = await createPaymobIntentionForCart(
    validBody(),
    { authenticated: false },
    VALID_IDEMPOTENCY_KEY,
    ENV,
    deps
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.status, 401);
});

test("rejects when PAYMOB_SECRET_KEY is missing, before touching the cart/DB", async () => {
  const { deps } = makeDeps({
    fetchProducts: async () => {
      throw new Error("should not be called");
    },
  });
  const outcome = await createPaymobIntentionForCart(
    validBody(),
    AUTH,
    VALID_IDEMPOTENCY_KEY,
    { secretKey: undefined, integrationId: "5835485" },
    deps
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.status, 503);
});

test("rejects when PAYMOB_CARD_INTEGRATION_ID is missing, before touching the cart/DB", async () => {
  const { deps } = makeDeps({
    fetchProducts: async () => {
      throw new Error("should not be called");
    },
  });
  const outcome = await createPaymobIntentionForCart(
    validBody(),
    AUTH,
    VALID_IDEMPOTENCY_KEY,
    { secretKey: "sk_test_secret", integrationId: undefined },
    deps
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.status, 503);
});

test("rejects an invalid cart/order body", async () => {
  const { deps } = makeDeps();
  const outcome = await createPaymobIntentionForCart(
    { items: [{ productId: "prod-1" }], shipping: validShipping },
    AUTH,
    VALID_IDEMPOTENCY_KEY,
    ENV,
    deps
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.status, 400);
});

test("rejects an empty cart", async () => {
  const { deps } = makeDeps();
  const outcome = await createPaymobIntentionForCart(
    validBody({ items: [] }),
    AUTH,
    VALID_IDEMPOTENCY_KEY,
    ENV,
    deps
  );
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.status, 400);
    assert.match(outcome.error, /empty/i);
  }
});

test("rejects a cart total that resolves to zero (invalid amount)", async () => {
  const { deps } = makeDeps({
    fetchProducts: async () => ({ ok: true as const, rows: [product({ price: 0 })] }),
    fetchShippingSettings: async () => ({ ...SHIPPING_SETTINGS, flatDeliveryFeeEgp: 0 }),
  });
  const outcome = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.status, 400);
    assert.match(outcome.error, /invalid order amount/i);
  }
});

test("rejects a cart containing a non-EGP priced product", async () => {
  const { deps } = makeDeps({
    fetchProducts: async () => ({ ok: true as const, rows: [product({ currency: "USD" })] }),
  });
  const outcome = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.status, 400);
    assert.match(outcome.error, /EGP/);
  }
});

test("creates a payment attempt and returns clientSecret + paymentAttemptId on success", async () => {
  const { deps, store, getCreateIntentionCalls } = makeDeps();
  const outcome = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);

  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.status, 200);
    assert.equal(outcome.clientSecret, "egy_csk_test_success");
    assert.ok(outcome.paymentAttemptId);
    // Only these two fields ever reach the browser.
    assert.deepEqual(Object.keys(outcome).sort(), ["clientSecret", "ok", "paymentAttemptId", "status"]);
  }
  assert.equal(getCreateIntentionCalls().length, 1);

  // Paymob success -> pending.
  const row = store.byId.get((outcome as { paymentAttemptId: string }).paymentAttemptId);
  assert.ok(row);
  assert.equal(row!.status, "pending");
  // provider_intention_id / provider_order_id ARE persisted.
  assert.equal(row!.providerIntentionId, "pi_1");
  assert.equal(row!.providerOrderId, 1);
});

test("special_reference sent to Paymob is derived from the payment_attempt id", async () => {
  const { deps, getCreateIntentionCalls } = makeDeps();
  const outcome = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(outcome.ok, true);
  const [sentPayload] = getCreateIntentionCalls() as [{ special_reference: string }];
  if (outcome.ok) {
    assert.equal(sentPayload.special_reference, `mahaly_${outcome.paymentAttemptId}`);
  }
});

test("clientSecret is never passed to any persistence dependency", async () => {
  const calls: { fn: string; args: unknown[] }[] = [];
  const { deps } = makeDeps({
    createPaymentAttempt: async (input) => {
      calls.push({ fn: "createPaymentAttempt", args: [input] });
      const store = makeFakeAttemptStore();
      return store.createPaymentAttempt(input);
    },
    markIntentionCreated: async (id, intentionId, orderId) => {
      calls.push({ fn: "markIntentionCreated", args: [id, intentionId, orderId] });
    },
  });
  const outcome = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(outcome.ok, true);

  const clientSecret = (outcome as { clientSecret: string }).clientSecret;
  const serializedCalls = JSON.stringify(calls);
  assert.doesNotMatch(serializedCalls, new RegExp(clientSecret));

  // markIntentionCreated's own signature has no client_secret parameter at
  // all — structurally impossible to pass it even by mistake.
  const markCall = calls.find((c) => c.fn === "markIntentionCreated")!;
  assert.equal(markCall.args.length, 3);
});

test("surfaces a safe, generic error when the Paymob API call fails, and records a categorized failure_reason (created -> failed)", async () => {
  const { deps, store } = makeDeps({
    createIntention: async () => {
      throw new PaymobApiError("Paymob rejected the intention request", 401);
    },
  });
  const outcome = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.status, 502);
    assert.doesNotMatch(outcome.error, /sk_test_secret/);
  }

  const [row] = [...store.byId.values()];
  assert.equal(row.status, "failed");
  assert.equal(row.failureReason, "paymob_auth_error");
  // Never the raw provider error text.
  assert.doesNotMatch(row.failureReason ?? "", /rejected the intention request/);
});

test("never trusts a client-supplied price — the intention amount always comes from the server-side product price", async () => {
  const { deps, getCreateIntentionCalls } = makeDeps();
  const tamperedBody = validBody({
    items: [
      {
        productId: "prod-1",
        size: "M",
        color: "Sand",
        quantity: 2,
        price: 0.01,
        totalEgp: 0.01,
        amount: 1,
      },
    ],
    totalEgp: 1,
    amount: 1,
  });

  const outcome = await createPaymobIntentionForCart(tamperedBody, AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(outcome.ok, true);
  const [sentPayload] = getCreateIntentionCalls() as [{ amount: number }];
  // 500 EGP/unit * qty 2 + 50 flat shipping = 1050 EGP -> 105000 piasters.
  assert.equal(sentPayload.amount, 105000);
});

test("the items array sent to Paymob always sums to exactly the top-level amount — Paymob rejects the request outright (406 unmatched_item_prices) otherwise, and a nonzero delivery fee previously wasn't represented as a line item at all", async () => {
  const { deps, getCreateIntentionCalls } = makeDeps();

  const outcome = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(outcome.ok, true);

  const [sentPayload] = getCreateIntentionCalls() as [
    { amount: number; items: { amount: number; quantity: number; name: string }[] }
  ];
  const itemsTotal = sentPayload.items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  assert.equal(itemsTotal, sentPayload.amount);
  // 500 EGP/unit * qty 2 + 50 flat shipping = 1050 EGP -> 105000 piasters,
  // with the flat 50 EGP delivery fee represented as its own line item.
  assert.equal(sentPayload.amount, 105000);
  assert.ok(sentPayload.items.some((item) => item.name === "Delivery" && item.amount === 5000));
});

test("no delivery line item is added when shipping is free (order subtotal at/above the free-shipping threshold)", async () => {
  const { deps, getCreateIntentionCalls } = makeDeps({
    fetchShippingSettings: async () => ({ ...SHIPPING_SETTINGS, freeShippingThresholdEgp: 0 }),
  });

  const outcome = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(outcome.ok, true);

  const [sentPayload] = getCreateIntentionCalls() as [
    { amount: number; items: { amount: number; quantity: number; name: string }[] }
  ];
  const itemsTotal = sentPayload.items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
  assert.equal(itemsTotal, sentPayload.amount);
  assert.ok(!sentPayload.items.some((item) => item.name === "Delivery"));
});

test("a duplicate Idempotency-Key with the same payload replays the existing attempt and never calls Paymob twice", async () => {
  const { deps, getCreateIntentionCalls } = makeDeps();
  const first = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(first.ok, true);
  assert.equal(getCreateIntentionCalls().length, 1);

  const second = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.status, 409);
  // Still exactly one Paymob call across both requests.
  assert.equal(getCreateIntentionCalls().length, 1);
});

test("a duplicate Idempotency-Key with a different payload is rejected safely, without calling Paymob", async () => {
  const { deps, getCreateIntentionCalls } = makeDeps();
  const first = await createPaymobIntentionForCart(validBody(), AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(first.ok, true);

  const differentBody = validBody({
    items: [{ productId: "prod-1", size: "M", color: "Sand", quantity: 5 }],
  });
  const second = await createPaymobIntentionForCart(differentBody, AUTH, VALID_IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.equal(second.status, 409);
    assert.match(second.error, /different order details/i);
  }
  assert.equal(getCreateIntentionCalls().length, 1);
});
