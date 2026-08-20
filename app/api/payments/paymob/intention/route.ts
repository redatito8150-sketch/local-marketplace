import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRequestIdentity } from "@/lib/supabase/requestUser";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { MAX_ORDER_BODY_BYTES } from "@/lib/orders/orderRequest";
import { getVariantsForProducts } from "@/lib/data/variants";
import { getBrandFulfillmentFlags } from "@/lib/data/brands";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { DEFAULT_SHIPPING_SETTINGS } from "@/content/settings";
import {
  createPaymobIntentionForCart,
  type CouponLookupRow,
  type CreatePaymentAttemptInput,
  type CreatePaymentAttemptResult,
} from "@/lib/payments/createIntentionForCart";
import { createPaymobIntention } from "@/lib/payments/paymob";
import { logError } from "@/lib/errorLog";
import type { ProductLookupRow } from "@/lib/payments/intentionCart";
import type { ShippingSettingsContent } from "@/types";

// Creates a Paymob payment Intention for the caller's cart — the first step
// of online card checkout (Paymob's hosted Unified Checkout is launched
// client-side with the returned client_secret). This endpoint is
// intentionally decoupled from app/api/orders/route.ts / place_order():
//
// place_order() has no "pending" or "awaiting payment" order concept today —
// it's one atomic call that finalizes the order and decrements stock
// immediately, and orders.payment_method is currently constrained to only
// 'cash_on_delivery' (see supabase/schema.sql). Phase 1 of the approved
// Payment Attempts Architecture (Rev. 2) adds a durable
// public.payment_attempts row (supabase/migrations/
// 20260811000001_payment_attempts.sql) that this route now creates *before*
// calling Paymob, using the row's own id to derive special_reference — but
// still creates no order and marks nothing as paid. Once the Paymob webhook
// (a separate, not-yet-built piece of work) verifies payment succeeded,
// that handler is what will call a future place_paid_order — this route
// never does, and never will.
export async function POST(request: NextRequest) {
  const idempotencyKeyHeader = request.headers.get("idempotency-key");

  const identity = await getRequestIdentity(request);
  const auth =
    identity.status === "authenticated"
      ? { authenticated: true as const, userId: identity.user.id }
      : { authenticated: false as const, invalidCredentials: identity.status === "invalid_credentials" };

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_ORDER_BODY_BYTES) {
    return NextResponse.json({ error: "Request is too large" }, { status: 413 });
  }
  if (!checkRateLimit(`paymob-intention:${getClientIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many payment attempts — try again shortly" }, { status: 429 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const outcome = await createPaymobIntentionForCart(
    rawBody,
    auth,
    idempotencyKeyHeader,
    {
      secretKey: process.env.PAYMOB_SECRET_KEY,
      integrationId: process.env.PAYMOB_CARD_INTEGRATION_ID,
    },
    {
      // Re-fetches prices/availability from the DB, exactly like
      // app/api/orders/route.ts does — the client only ever sends
      // productId/size/color/quantity, never a price this trusts directly.
      fetchProducts: async (productIds) => {
        const [{ data, error }, mediaResult] = await Promise.all([
          supabaseAdmin
            .from("products")
            .select(
              "id, name, brand_name, brand_slug, price, discount_percent, discount_ends_at, currency, status, publish_date, image, first_stocked_at, launch_policy, brands!products_brand_slug_fkey!inner(is_active)"
            )
            .in("id", productIds),
          supabaseAdmin
            .from("product_media")
            .select("product_id, storage_reference, color_option_value_id")
            .in("product_id", productIds)
            .eq("is_archived", false)
            .not("color_option_value_id", "is", null)
            .order("display_order", { ascending: true }),
        ]);
        if (error) return { ok: false };
        if (mediaResult.error) return { ok: false };
        const colorsByProduct = new Map<string, Record<string, string>>();
        for (const media of mediaResult.data ?? []) {
          if (!media.color_option_value_id) continue;
          const colors = colorsByProduct.get(media.product_id) ?? {};
          colors[media.color_option_value_id] ??= media.storage_reference;
          colorsByProduct.set(media.product_id, colors);
        }
        return {
          ok: true,
          rows: ((data ?? []) as unknown as ProductLookupRow[]).map((row) => ({
            ...row,
            color_images_by_option_value_id: colorsByProduct.get(row.id) ?? {},
          })),
        };
      },
      fetchVariants: (productIds) => getVariantsForProducts(productIds, supabaseAdmin).catch(() => null),
      fetchBrandFlags: (slugs) => getBrandFulfillmentFlags(slugs),
      fetchShippingSettings: () =>
        getSiteContentWithFallback<ShippingSettingsContent>("shipping_settings", DEFAULT_SHIPPING_SETTINGS),
      fetchCoupon: async (code) => {
        const { data } = await supabaseAdmin
          .from("coupons")
          .select("code, discount_type, discount_value, max_uses, used_count, expires_at, active")
          .eq("code", code)
          .maybeSingle();
        return (data as CouponLookupRow | null) ?? null;
      },

      // The database's own unique (idempotency_actor, client_request_id)
      // index is what actually prevents two rows for the same
      // Idempotency-Key, even under real concurrency — this just calls the
      // RPC and translates its result/errors into the typed contract
      // createPaymobIntentionForCart expects.
      createPaymentAttempt: async (input: CreatePaymentAttemptInput): Promise<CreatePaymentAttemptResult> => {
        const { data, error } = await supabaseAdmin.rpc("create_payment_attempt", {
          p_user_id: input.userId,
          p_idempotency_actor: input.idempotencyActor,
          p_client_request_id: input.clientRequestId,
          p_request_hash: input.requestHash,
          p_amount_cents: input.amountCents,
          p_currency: input.currency,
          p_cart_snapshot: input.cartSnapshot,
          p_shipping_snapshot: input.shippingSnapshot,
          p_coupon_snapshot: input.couponSnapshot ?? null,
        });

        if (error) {
          if (error.message?.startsWith("IDEMPOTENCY_CONFLICT")) {
            return {
              ok: false,
              status: 409,
              error: "This checkout key was already used with different order details.",
            };
          }
          if (error.message?.startsWith("FULFILLMENT_TRANSITION_BLOCKS_PAYMENT")) {
            return {
              ok: false,
              status: 409,
              error: "An item in your cart is temporarily unavailable while its brand updates fulfillment. Please try again shortly.",
            };
          }
          // Audit finding PAY-06 (docs/audits/2026-08-20-production-
          // security-correctness-reliability-audit-en.md): create_payment_
          // attempt now atomically reserves the coupon (used_count plus
          // every other in-flight attempt's reservation) instead of the
          // stale used_count-only check this route used to do on its own —
          // this is the real, race-safe rejection.
          if (error.message?.startsWith("COUPON_LIMIT_REACHED")) {
            return {
              ok: false,
              status: 409,
              error: "This coupon has just reached its usage limit. Remove it to continue.",
            };
          }
          logError("Payment attempt creation failed", error.message);
          return { ok: false, status: 500, error: "We couldn't start card payment right now. Please try again." };
        }

        const result = data as {
          payment_attempt_id: string;
          special_reference: string;
          status: string;
          replayed: boolean;
        };
        return {
          ok: true,
          paymentAttemptId: result.payment_attempt_id,
          specialReference: result.special_reference,
          status: result.status,
          replayed: result.replayed,
        };
      },
      markIntentionCreated: async (paymentAttemptId, providerIntentionId, providerOrderId) => {
        const { error } = await supabaseAdmin.rpc("mark_paymob_intention_created", {
          p_payment_attempt_id: paymentAttemptId,
          p_provider_intention_id: providerIntentionId,
          p_provider_order_id: providerOrderId,
        });
        if (error) throw new Error(error.message);
      },
      markIntentionFailed: async (paymentAttemptId, failureReason) => {
        const { error } = await supabaseAdmin.rpc("mark_paymob_intention_failed", {
          p_payment_attempt_id: paymentAttemptId,
          p_failure_reason: failureReason,
        });
        if (error) throw new Error(error.message);
      },
      createIntention: (payload, secretKey) => createPaymobIntention(payload, secretKey),
    }
  );

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  // Only what the frontend needs to launch Paymob's hosted checkout, plus
  // the attempt's own id (not sensitive) for a future status-polling
  // surface — never the amount, cart contents, or anything else.
  return NextResponse.json({ clientSecret: outcome.clientSecret, paymentAttemptId: outcome.paymentAttemptId });
}
