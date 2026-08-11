import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPaymobIntentionPayload,
  createPaymobIntention,
  egpToAmountCents,
  PaymobApiError,
} from "../lib/payments/paymob.ts";

const billingData = {
  first_name: "Nour",
  last_name: "Ahmed",
  email: "nour@example.com",
  phone_number: "+20 100 000 0000",
  street: "10 Nile Street",
  building: "NA",
  floor: "NA",
  apartment: "NA",
  city: "Cairo",
  state: "Cairo",
  country: "EG",
};

test("egpToAmountCents converts EGP to piasters and rounds to the nearest one", () => {
  assert.equal(egpToAmountCents(129.5), 12950);
  assert.equal(egpToAmountCents(1), 100);
  assert.equal(egpToAmountCents(0), 0);
  assert.equal(egpToAmountCents(129.999), 13000);
});

test("buildPaymobIntentionPayload shapes the exact Paymob Intention API body", () => {
  const payload = buildPaymobIntentionPayload({
    amountCents: 15000,
    integrationId: 5835485,
    billingData,
    specialReference: "mahaly_abc123",
    items: [{ name: "Linen shirt", amount: 15000, quantity: 1 }],
  });

  assert.deepEqual(payload, {
    amount: 15000,
    currency: "EGP",
    payment_methods: [5835485],
    items: [{ name: "Linen shirt", amount: 15000, quantity: 1 }],
    billing_data: billingData,
    special_reference: "mahaly_abc123",
  });
});

const payload = buildPaymobIntentionPayload({
  amountCents: 15000,
  integrationId: 5835485,
  billingData,
  specialReference: "mahaly_abc123",
  items: [{ name: "Linen shirt", amount: 15000, quantity: 1 }],
});

test("createPaymobIntention posts to the intention endpoint with a Token auth header and never leaks the secret in errors", async () => {
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    capturedUrl = url;
    capturedInit = init;
    return new Response(
      JSON.stringify({ id: "pi_test_123", client_secret: "egy_csk_test_456", intention_order_id: 789 }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  }) as unknown as typeof fetch;

  const result = await createPaymobIntention(payload, "sk_test_super_secret", fakeFetch);

  assert.equal(capturedUrl, "https://accounts.paymob.com/v1/intention/");
  assert.equal((capturedInit!.headers as Record<string, string>).Authorization, "Token sk_test_super_secret");
  assert.equal(JSON.parse(capturedInit!.body as string).amount, 15000);
  assert.deepEqual(result, {
    clientSecret: "egy_csk_test_456",
    intentionId: "pi_test_123",
    paymobOrderId: 789,
  });
});

test("createPaymobIntention throws a safe PaymobApiError on a non-2xx response, without echoing the secret", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ message: "invalid integration" }), { status: 401 })) as unknown as typeof fetch;

  await assert.rejects(
    () => createPaymobIntention(payload, "sk_test_super_secret", fakeFetch),
    (error: unknown) => {
      assert.ok(error instanceof PaymobApiError);
      assert.equal(error.status, 401);
      assert.doesNotMatch(error.message, /sk_test_super_secret/);
      return true;
    }
  );
});

test("createPaymobIntention throws a safe PaymobApiError on a network failure", async () => {
  const fakeFetch = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;

  await assert.rejects(
    () => createPaymobIntention(payload, "sk_test_super_secret", fakeFetch),
    (error: unknown) => {
      assert.ok(error instanceof PaymobApiError);
      assert.doesNotMatch(error.message, /sk_test_super_secret/);
      return true;
    }
  );
});

test("createPaymobIntention throws when Paymob's response is missing a client_secret", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ id: "pi_test_123" }), { status: 201 })) as unknown as typeof fetch;

  await assert.rejects(
    () => createPaymobIntention(payload, "sk_test_super_secret", fakeFetch),
    PaymobApiError
  );
});
