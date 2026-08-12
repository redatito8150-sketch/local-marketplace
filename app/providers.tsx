"use client";

import { AuthProvider } from "@/context/AuthContext";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { usePendingCardPaymentReconciliation } from "@/lib/hooks/usePendingCardPaymentReconciliation";

// Runs once per app load (this provider tree doesn't remount on
// client-side route changes) — the app-wide backstop for reconciling a
// card payment attempt that was interrupted before the checkout page's
// own confirmation polling could confirm fulfillment. See
// lib/hooks/usePendingCardPaymentReconciliation.ts for why this is called
// from here AND separately from the checkout page itself.
function PendingCardPaymentReconciler() {
  usePendingCardPaymentReconciliation();
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>
        <PendingCardPaymentReconciler />
        <WishlistProvider>{children}</WishlistProvider>
      </CartProvider>
    </AuthProvider>
  );
}
