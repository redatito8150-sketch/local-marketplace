"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { fetchWithAppError } from "@/lib/errors/client";
import {
  clearPendingCardAttempt,
  readPendingCardAttempt,
} from "@/lib/payments/pendingCardAttempt";
import {
  reconcilePendingCardPayment,
  type PendingCardAttemptStatus,
} from "@/lib/payments/reconcilePendingCardPayment";

// The Back/refresh/return-later recovery path for a card payment attempt
// that lost its in-memory tracking (app/checkout/page.tsx's cardState is
// plain useReducer state — it does not survive an unmount/refresh). Runs
// one reconciliation check, not a live poller — the checkout page's own
// confirmation polling is what handles "actively watching a payment in
// progress"; this hook only exists to catch attempts that were already
// interrupted by the time this component mounted.
//
// Called from two places on purpose: once globally (a component nested
// under CartProvider, mounted once per app load — covers a full refresh
// or returning to Mahaly later) and once from the checkout page itself
// (covers pressing Back into /checkout via client-side routing, which
// remounts the page but not the app-level providers). Both calls share
// the exact same underlying logic and are naturally idempotent — a
// second call after the first already reconciled or cleared the marker
// simply finds nothing to do.
export function usePendingCardPaymentReconciliation() {
  const { user } = useAuth();
  const { removePurchasedItems, isHydrated } = useCart();
  const runningForRef = useRef<string | null>(null);

  useEffect(() => {
    // CartProvider's own hydration effect and this one both gate on
    // useAuth()'s user resolving, and this component is a CHILD of
    // CartProvider (see app/providers.tsx) — React fires child effects
    // before parent effects on the same commit, so without this guard,
    // the very first time `user` becomes available, this effect used to
    // run BEFORE CartProvider's hydration effect had replaced its
    // placeholder `items: []` with the real stored cart. removePurchasedItems
    // would then mutate that empty placeholder (a no-op), the pending-
    // attempt marker still got cleared as if reconciliation succeeded, and
    // moments later hydration overwrote state with the untouched original
    // cart — silently discarding the removal. This was the actual reason
    // a card order's item kept reappearing in the cart after every payment
    // that involved a redirect/refresh (e.g. a 3D Secure bounce), no matter
    // what was configured on Paymob's side — waiting for isHydrated fixes
    // it at the source instead.
    if (!user || !isHydrated) return;
    const pending = readPendingCardAttempt(user.id);
    if (!pending) return;
    // Guards against this hook's two call sites (or a re-render of either)
    // both kicking off a reconciliation for the same attempt concurrently.
    if (runningForRef.current === pending.paymentAttemptId) return;
    runningForRef.current = pending.paymentAttemptId;

    const userId = user.id;
    void reconcilePendingCardPayment(pending.paymentAttemptId, {
      fetchAttemptStatus: async (paymentAttemptId) => {
        const result = await fetchWithAppError<PendingCardAttemptStatus>(
          `/api/payments/paymob/attempts/${paymentAttemptId}`
        );
        return result.ok ? { ok: true, data: result.data } : { ok: false };
      },
      removePurchasedItems,
      clearMarker: () => clearPendingCardAttempt(userId),
    }).finally(() => {
      if (runningForRef.current === pending.paymentAttemptId) {
        runningForRef.current = null;
      }
    });
  }, [user, isHydrated, removePurchasedItems]);
}
