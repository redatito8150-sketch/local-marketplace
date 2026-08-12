import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Safe, customer-facing status read for the checkout page's confirmation
// polling (lib/payments/cardPaymentAttempt.ts's "confirming" phase). Uses
// the cookie-bound (anon-key) client, not supabaseAdmin — RLS itself
// (the Phase 1 migration's "Customers can read their own payment
// attempts" policy + column grant) is what scopes this to the caller's
// own attempt and to only the safe columns; there is no separate
// ownership check to get wrong here.
//
// Never returns shipping_snapshot, special_reference, or any provider id
// — RLS's column grant makes those structurally unreadable through this
// client, regardless of what this route asks for. The one deliberate
// exception is purchasedItems below: a narrow, four-field-per-line
// projection of cart_snapshot (never the raw column, never price/name/
// brand), read through get_fulfilled_cart_snapshot_items — an
// ownership-checked RPC that only returns rows once status is
// 'fulfilled' — so the frontend can reconcile exactly which cart lines
// were paid for (see context/CartContext.tsx's removePurchasedItems and
// lib/payments/reconcilePendingCardPayment.ts) instead of ever blindly
// clearing the whole cart.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid payment attempt id" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to check payment status." }, { status: 401 });
  }

  const { data: attempt, error } = await supabase
    .from("payment_attempts")
    .select("id, status, amount_cents, currency, failure_reason, paid_at, processed_at, order_group_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "We couldn't check payment status. Please try again." }, { status: 500 });
  }
  if (!attempt) {
    // Either it doesn't exist, or RLS correctly hid a row that isn't this
    // caller's own — same response either way, never distinguish the two.
    return NextResponse.json({ error: "Payment attempt not found" }, { status: 404 });
  }

  let isPartial = false;
  // Only ever populated once status is 'fulfilled' AND fulfillment was
  // NOT partial — with a partial result there is no safe way to tell,
  // from cart_snapshot alone, which specific lines belonged to the bucket
  // that actually succeeded vs. the one that failed (buckets aren't
  // tracked per cart_snapshot line), so this deliberately stays empty and
  // the frontend must not attempt automatic reconciliation for that case.
  let purchasedItems: { productId: string; size: string; color: string; quantity: number }[] = [];
  if (attempt.status === "fulfilled") {
    const { data: summary } = await supabase
      .rpc("payment_attempt_fulfillment_summary", { p_payment_attempt_id: id })
      .maybeSingle();
    isPartial = Boolean((summary as { is_partial?: boolean } | null)?.is_partial);

    if (!isPartial) {
      const { data: snapshotItems } = await supabase.rpc("get_fulfilled_cart_snapshot_items", {
        p_payment_attempt_id: id,
      });
      purchasedItems = ((snapshotItems ?? []) as { product_id: string; size: string; color: string; quantity: number }[]).map(
        (row) => ({ productId: row.product_id, size: row.size, color: row.color, quantity: row.quantity })
      );
    }
  }

  return NextResponse.json({
    status: attempt.status,
    amountCents: attempt.amount_cents,
    currency: attempt.currency,
    failureReason: attempt.failure_reason,
    paidAt: attempt.paid_at,
    processedAt: attempt.processed_at,
    orderGroupId: attempt.order_group_id,
    isPartial,
    purchasedItems,
  });
}
