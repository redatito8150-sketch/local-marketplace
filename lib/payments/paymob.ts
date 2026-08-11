// Paymob Intention API client — the modern "Create Intention" endpoint
// (POST /v1/intention/), not the legacy 3-step Accept API (auth token ->
// order registration -> payment key). Docs: developers.paymob.com/paymob-docs/
// developers/intention-apis/create-intention.
//
// This module never reads process.env itself — the caller (the route
// handler) reads PAYMOB_SECRET_KEY/PAYMOB_CARD_INTEGRATION_ID and passes
// them in, so this file stays a pure, dependency-injected client that's
// trivial to unit test with a fake fetch implementation.

// Confirmed live (2026-08-12) against Paymob's own API: this endpoint
// returns a structured DRF auth-error JSON body for an invalid token
// ({"detail":"Authentication credentials were not provided."}), while
// accounts.paymob.com — used here originally — does not resolve in DNS at
// all. Same host the Pixel widget itself calls client-side (see the CSP
// comment in next.config.js) — Paymob uses one host for both, not two.
export const PAYMOB_INTENTION_URL = "https://accept.paymob.com/v1/intention/";

// Paymob amounts are always integers in the currency's smallest unit
// (piasters for EGP, i.e. cents). Rounds to the nearest piaster rather than
// truncating, so e.g. 129.995 EGP -> 13000, not 12999.
export function egpToAmountCents(egp: number): number {
  return Math.round(egp * 100);
}

export interface PaymobBillingData {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
  city: string;
  state: string;
  country: string;
}

export interface PaymobIntentionItem {
  name: string;
  amount: number;
  description?: string;
  quantity: number;
}

export interface PaymobIntentionPayload {
  amount: number;
  currency: "EGP";
  payment_methods: number[];
  items: PaymobIntentionItem[];
  billing_data: PaymobBillingData;
  special_reference: string;
}

export interface BuildPaymobIntentionPayloadInput {
  amountCents: number;
  integrationId: number;
  items: PaymobIntentionItem[];
  billingData: PaymobBillingData;
  specialReference: string;
}

export function buildPaymobIntentionPayload(
  input: BuildPaymobIntentionPayloadInput
): PaymobIntentionPayload {
  return {
    amount: input.amountCents,
    currency: "EGP",
    payment_methods: [input.integrationId],
    items: input.items,
    billing_data: input.billingData,
    special_reference: input.specialReference,
  };
}

export interface PaymobIntentionResult {
  clientSecret: string;
  intentionId: string;
  paymobOrderId: number;
}

// Thrown for every failure mode (network error, non-2xx response, malformed
// body) so callers have exactly one error type to catch — the message is
// always safe to log (never includes the secret key or the raw response
// body, which could echo back customer billing data).
export class PaymobApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "PaymobApiError";
    this.status = status;
  }
}

interface PaymobIntentionResponseBody {
  id?: string;
  client_secret?: string;
  intention_order_id?: number;
}

// `fetchImpl` defaults to the global fetch but is always overridable — the
// test suite injects a stub so no real network call is ever made.
export async function createPaymobIntention(
  payload: PaymobIntentionPayload,
  secretKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<PaymobIntentionResult> {
  let response: Response;
  try {
    response = await fetchImpl(PAYMOB_INTENTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${secretKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new PaymobApiError("Could not reach Paymob");
  }

  if (!response.ok) {
    throw new PaymobApiError(`Paymob rejected the intention request`, response.status);
  }

  let body: PaymobIntentionResponseBody;
  try {
    body = (await response.json()) as PaymobIntentionResponseBody;
  } catch {
    throw new PaymobApiError("Paymob returned an unreadable response", response.status);
  }

  if (!body.client_secret) {
    throw new PaymobApiError("Paymob response was missing a client secret", response.status);
  }

  return {
    clientSecret: body.client_secret,
    intentionId: body.id ?? "",
    paymobOrderId: body.intention_order_id ?? 0,
  };
}
