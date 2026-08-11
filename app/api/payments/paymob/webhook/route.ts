import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { verifyTransactionHmac, type PaymobTransactionObject } from "@/lib/payments/paymobWebhook";
import { processPaymobWebhook, type ProcessWebhookDeps } from "@/lib/payments/processPaymobWebhook";
import { logError } from "@/lib/errorLog";

// Paymob's "Transaction Processed" server-to-server callback — the ONLY
// authoritative source of payment status in this codebase. Nothing the
// browser reports (Pixel success UI, a redirect, a query parameter) is
// ever trusted; see app/checkout/page.tsx and lib/payments/
// cardPaymentAttempt.ts for why the frontend structurally cannot mark
// anything paid.
//
// HMAC verification happens FIRST, before touching the database in any
// way — an invalid signature is rejected outright. See
// lib/payments/paymobWebhook.ts's module comment for the exact field
// list/algorithm used and its verification status (corroborated from
// multiple doc mirrors, not confirmed against a live sandbox payload yet
// — the top item to verify before this goes near production).
export async function POST(request: NextRequest) {
  const hmac = request.nextUrl.searchParams.get("hmac");

  const hmacSecret = process.env.PAYMOB_HMAC_SECRET;
  if (!hmacSecret) {
    logError("Paymob webhook received but PAYMOB_HMAC_SECRET is not configured", "missing env var");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = body as { type?: string; obj?: PaymobTransactionObject };
  if (parsed.type !== "TRANSACTION" || !parsed.obj) {
    // Not a transaction callback (e.g. a token callback) — nothing for
    // this route to do. Acknowledge so Paymob doesn't retry indefinitely.
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!verifyTransactionHmac(parsed.obj, hmac, hmacSecret)) {
    // Never log the payload or the secret — only the bare fact of an
    // invalid signature, with the transaction id for cross-referencing
    // against Paymob's own dashboard if needed.
    logError("Paymob webhook HMAC verification failed", `transaction id ${String(parsed.obj.id)}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const deps: ProcessWebhookDeps = {
    findPaymentAttemptIdByProviderOrderId: async (providerOrderId) => {
      const { data, error } = await supabaseAdmin
        .from("payment_attempts")
        .select("id")
        .eq("provider_order_id", providerOrderId)
        .maybeSingle();
      if (error) {
        logError("Paymob webhook: payment_attempts lookup failed", error.message);
        return null;
      }
      return data?.id ?? null;
    },
    markPaid: async (input) => {
      const { data, error } = await supabaseAdmin.rpc("mark_payment_attempt_paid", {
        p_payment_attempt_id: input.paymentAttemptId,
        p_provider_transaction_id: input.providerTransactionId,
        p_provider_event_id: input.providerEventId,
        p_amount_cents: input.amountCents,
        p_currency: input.currency,
      });
      if (error) throw new Error(error.message);
      const result = data as { status: string; replayed: boolean };
      return { status: result.status, replayed: result.replayed };
    },
    markDeclined: async (input) => {
      const { data, error } = await supabaseAdmin.rpc("mark_payment_attempt_declined", {
        p_payment_attempt_id: input.paymentAttemptId,
        p_provider_transaction_id: input.providerTransactionId,
        p_provider_event_id: input.providerEventId,
        p_failure_reason: input.failureReason,
      });
      if (error) throw new Error(error.message);
      const result = data as { status: string; replayed: boolean };
      return { status: result.status, replayed: result.replayed };
    },
    placePaidOrder: async (paymentAttemptId) => {
      const { data, error } = await supabaseAdmin.rpc("place_paid_order", {
        p_payment_attempt_id: paymentAttemptId,
      });
      if (error) throw new Error(error.message);
      const result = data as {
        status: "fulfilled" | "fulfillment_failed";
        order_group_id: string | null;
        is_partial: boolean;
        replayed: boolean;
      };
      return {
        status: result.status,
        orderGroupId: result.order_group_id,
        isPartial: result.is_partial,
        replayed: result.replayed,
      };
    },
  };

  try {
    const outcome = await processPaymobWebhook(parsed.obj, deps);
    if (!outcome.ok) {
      logError("Paymob webhook processing rejected", outcome.reason);
      return NextResponse.json({ error: outcome.reason }, { status: outcome.status });
    }

    if (outcome.action === "paid_and_fulfilled" && outcome.result.status === "fulfillment_failed") {
      logError(
        "Paymob payment succeeded but fulfillment failed entirely — needs manual refund",
        `payment_attempt_id ${outcome.paymentAttemptId}`
      );
    } else if (outcome.action === "paid_and_fulfilled" && outcome.result.isPartial) {
      logError(
        "Paymob payment partially fulfilled — some vendor shipments failed, needs partial refund review",
        `payment_attempt_id ${outcome.paymentAttemptId}`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError("Paymob webhook processing failed", error instanceof Error ? error.message : "Unknown error");
    // 500 so Paymob retries — mark_payment_attempt_paid/declined and
    // place_paid_order are all safely retry-idempotent.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
