// Pure orchestration for POST /api/payments/paymob/intention — every I/O
// dependency (DB reads/writes, the outbound Paymob call) is injected, so
// this function has zero import-time dependency on Supabase and can be
// fully exercised in tests with fake data instead of a live database or a
// real Paymob request. app/api/payments/paymob/intention/route.ts is the
// only caller that wires in the real implementations.
//
// Phase 1 of the approved Payment Attempts Architecture (Rev. 2): a durable
// public.payment_attempts row is created (status: created) before Paymob is
// ever called, and transitioned to pending/failed once Paymob responds.
// This function still never creates an order, never touches
// `orders`/`order_items`, and never marks anything as paid — that is
// explicitly out of scope for this phase (see the architecture note in the
// route file). client_secret is returned to the caller and is never
// persisted anywhere.

import { validateOrderRequest } from "../orders/orderRequest.ts";
import { parseOrderIdempotencyKey, buildOrderIdempotencyActor, hashOrderRequest } from "../orders/idempotency.ts";
import {
  buildPaymobIntentionPayload,
  egpToAmountCents,
  PaymobApiError,
  type PaymobBillingData,
  type PaymobIntentionPayload,
  type PaymobIntentionResult,
} from "./paymob.ts";
import {
  computeIntentionAmount,
  resolveIntentionCart,
  type ProductLookupRow,
} from "./intentionCart.ts";
import { logError } from "../errorLog.ts";
import type { ProductVariant, ShippingSettingsContent } from "../../types/index.ts";

export interface CreateIntentionAuth {
  authenticated: boolean;
  userId?: string;
  // True when the caller presented credentials that turned out to be
  // invalid/expired (as opposed to no credentials at all) — lets the 401
  // message be specific without moving the auth check ahead of the
  // Idempotency-Key check below.
  invalidCredentials?: boolean;
}

export interface CreateIntentionEnv {
  secretKey: string | undefined;
  integrationId: string | undefined;
}

export interface CreatePaymentAttemptInput {
  userId: string;
  idempotencyActor: string;
  clientRequestId: string;
  requestHash: string;
  amountCents: number;
  currency: "EGP";
  cartSnapshot: unknown;
  shippingSnapshot: unknown;
}

export type CreatePaymentAttemptResult =
  | {
      ok: true;
      paymentAttemptId: string;
      specialReference: string;
      status: string;
      replayed: boolean;
    }
  | { ok: false; status: number; error: string };

export interface CreateIntentionDeps {
  fetchProducts: (productIds: string[]) => Promise<{ ok: true; rows: ProductLookupRow[] } | { ok: false }>;
  fetchVariants: (productIds: string[]) => Promise<Map<string, ProductVariant[]> | null>;
  fetchBrandFlags: (brandSlugs: string[]) => Promise<{ slug: string; isMahalyPartner: boolean }[]>;
  fetchShippingSettings: () => Promise<ShippingSettingsContent>;
  // Idempotent insert — see create_payment_attempt in the Phase 1 migration.
  // The database's own unique constraint is what actually prevents two rows
  // for the same idempotency key, even under real concurrency; this is just
  // the typed boundary the route wires a real RPC call into.
  createPaymentAttempt: (input: CreatePaymentAttemptInput) => Promise<CreatePaymentAttemptResult>;
  markIntentionCreated: (
    paymentAttemptId: string,
    providerIntentionId: string,
    providerOrderId: number
  ) => Promise<void>;
  markIntentionFailed: (paymentAttemptId: string, failureReason: string) => Promise<void>;
  createIntention: (payload: PaymobIntentionPayload, secretKey: string) => Promise<PaymobIntentionResult>;
  now?: () => Date;
}

export type CreateIntentionOutcome =
  | { ok: true; status: 200; clientSecret: string; paymentAttemptId: string }
  | { ok: false; status: number; error: string };

const GENERIC_UNAVAILABLE = "Card payment is temporarily unavailable. Please try Cash on Delivery.";
const GENERIC_CART_ERROR = "We couldn't validate your cart. Please try again.";
const GENERIC_PAYMOB_ERROR = "We couldn't start card payment right now. Please try again or use Cash on Delivery.";
const ALREADY_IN_PROGRESS_ERROR = "A payment for this request is already being processed.";

// A safe, categorized string only — never the raw PaymobApiError message.
// This value is stored in payment_attempts.failure_reason, which customers
// can read directly (see the RLS grant in the Phase 1 migration).
function categorizePaymobFailure(error: unknown): string {
  if (error instanceof PaymobApiError) {
    if (!error.status) return "paymob_unreachable";
    if (error.status >= 500) return "paymob_server_error";
    if (error.status === 401 || error.status === 403) return "paymob_auth_error";
    return "paymob_request_rejected";
  }
  return "unknown_error";
}

export async function createPaymobIntentionForCart(
  rawBody: unknown,
  auth: CreateIntentionAuth,
  idempotencyKeyHeader: string | null,
  env: CreateIntentionEnv,
  deps: CreateIntentionDeps
): Promise<CreateIntentionOutcome> {
  const clientRequestId = parseOrderIdempotencyKey(idempotencyKeyHeader);
  if (!clientRequestId) {
    return { ok: false, status: 400, error: "A valid Idempotency-Key header is required" };
  }

  if (!auth.authenticated || !auth.userId) {
    return {
      ok: false,
      status: 401,
      error: auth.invalidCredentials
        ? "Your session has expired. Sign in again to continue with card payment."
        : "Sign in to continue with card payment.",
    };
  }

  const integrationId = env.integrationId ? Number(env.integrationId) : NaN;
  if (!env.secretKey || !env.integrationId || Number.isNaN(integrationId)) {
    return { ok: false, status: 503, error: GENERIC_UNAVAILABLE };
  }

  const validation = validateOrderRequest(rawBody);
  if (!validation.ok) {
    return { ok: false, status: 400, error: validation.error };
  }
  const { items, shipping } = validation.value;

  const productIds = [...new Set(items.map((item) => item.productId))];
  const [productsResult, variantsByProduct] = await Promise.all([
    deps.fetchProducts(productIds),
    deps.fetchVariants(productIds),
  ]);

  if (!productsResult.ok || variantsByProduct === null) {
    return { ok: false, status: 500, error: GENERIC_CART_ERROR };
  }

  const productById = new Map(productsResult.rows.map((row) => [row.id, row]));
  const now = deps.now?.() ?? new Date();
  const resolved = resolveIntentionCart(items, productById, variantsByProduct, now);
  if (!resolved.ok) {
    return resolved;
  }

  if (resolved.lineItems.some((line) => line.currency !== "EGP")) {
    return {
      ok: false,
      status: 400,
      error: "Card payment is only available for EGP orders right now.",
    };
  }

  const brandSlugs = [...new Set(resolved.lineItems.map((line) => line.brandSlug).filter(Boolean))];
  const [brandFlags, shippingSettings] = await Promise.all([
    deps.fetchBrandFlags(brandSlugs),
    deps.fetchShippingSettings(),
  ]);
  const partnerFlagsBySlug = new Map(brandFlags.map((flag) => [flag.slug, flag.isMahalyPartner]));

  const amount = computeIntentionAmount(resolved.lineItems, partnerFlagsBySlug, shippingSettings);
  const amountCents = amount.totalAmountCents;
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, status: 400, error: "Invalid order amount." };
  }

  const idempotencyActor = buildOrderIdempotencyActor(auth.userId, "");
  const requestHash = hashOrderRequest({ items, shipping });

  const attemptResult = await deps.createPaymentAttempt({
    userId: auth.userId,
    idempotencyActor,
    clientRequestId,
    requestHash,
    amountCents,
    currency: "EGP",
    cartSnapshot: resolved.lineItems,
    shippingSnapshot: shipping,
  });

  if (!attemptResult.ok) {
    return attemptResult;
  }

  // Paymob's Create Intention API must be called AT MOST ONCE per
  // Idempotency-Key — full stop, not just "once it looks pending". Only
  // the request that actually won the database insert (replayed: false)
  // is ever allowed to proceed past this point. A replayed row — even one
  // still sitting at 'created', e.g. two requests racing milliseconds
  // apart before either has reached Paymob — must NOT also call Paymob:
  // that would create a second live intention for the same cart, which
  // the approved architecture explicitly forbids. Since client_secret is
  // never persisted, there is nothing to hand back to a replayed caller
  // anyway; the safe response is a clear conflict rather than risking a
  // silent second charge attempt. (A request stuck at 'created' forever —
  // e.g. the winner crashed between the insert and the Paymob call — is a
  // rare, known Phase 1 limitation: the customer needs a new
  // Idempotency-Key, i.e. a fresh checkout attempt, to get unstuck.
  // Automatic recovery is future work.)
  if (attemptResult.replayed) {
    return { ok: false, status: 409, error: ALREADY_IN_PROGRESS_ERROR };
  }

  const billingData: PaymobBillingData = {
    first_name: shipping.firstName,
    last_name: shipping.lastName,
    email: shipping.email,
    phone_number: shipping.phone,
    street: shipping.address,
    city: shipping.city,
    state: shipping.governorate,
    country: "EG",
    building: "NA",
    floor: "NA",
    apartment: "NA",
  };

  const payload = buildPaymobIntentionPayload({
    amountCents,
    integrationId,
    billingData,
    specialReference: attemptResult.specialReference,
    items: resolved.lineItems.map((line) => ({
      name: line.name,
      amount: egpToAmountCents(line.price),
      quantity: line.quantity,
    })),
  });

  try {
    const result = await deps.createIntention(payload, env.secretKey);

    // The customer's path to Paymob's checkout must not be blocked by a
    // transient failure to persist our own bookkeeping — Paymob already
    // has a live intention at this point. Log and continue; the row stays
    // 'created' until a future reconciliation path catches up.
    try {
      await deps.markIntentionCreated(attemptResult.paymentAttemptId, result.intentionId, result.paymobOrderId);
    } catch (persistError) {
      logError(
        "Failed to persist Paymob intention id after a successful Create Intention call",
        persistError instanceof Error ? persistError.message : "Unknown error"
      );
    }

    return {
      ok: true,
      status: 200,
      clientSecret: result.clientSecret,
      paymentAttemptId: attemptResult.paymentAttemptId,
    };
  } catch (error) {
    const message = error instanceof PaymobApiError ? error.message : "Unknown Paymob error";
    logError("Paymob intention creation failed", message);

    try {
      await deps.markIntentionFailed(attemptResult.paymentAttemptId, categorizePaymobFailure(error));
    } catch (persistError) {
      logError(
        "Failed to persist Paymob intention failure",
        persistError instanceof Error ? persistError.message : "Unknown error"
      );
    }

    return { ok: false, status: 502, error: GENERIC_PAYMOB_ERROR };
  }
}
