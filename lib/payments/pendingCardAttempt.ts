// Durable-enough marker for "a card payment attempt was started and may
// not have reached a terminal state yet" — survives exactly the
// interruptions the in-memory checkout page state (lib/payments/
// cardPaymentAttempt.ts) does not: browser Back, a full page refresh, a
// top-level 3DS redirect that navigates away and back, or the customer
// simply closing the tab and reopening Mahaly a bit later in the same
// browser session.
//
// sessionStorage (not localStorage) is deliberate — this is meant to be
// transient bookkeeping for reconciling ONE specific in-flight attempt,
// not a permanent record (payment_attempts itself is that record). If the
// browser session ends entirely before reconciliation runs, the marker is
// gone and the purchased items are left in the cart rather than silently
// removed with no trace of why — a known, documented limitation, not a
// silent failure mode: the customer still has their order (payment_
// attempts/orders are the source of truth), just an unreconciled cart.
//
// Scoped per authenticated user id, the same way cart storage itself is
// (see context/CartContext.tsx) — never read across accounts.

const PENDING_KEY_PREFIX = "mahaly_pending_card_attempt:";

interface PendingCardAttempt {
  paymentAttemptId: string;
}

function pendingCardAttemptKey(userId: string): string {
  return `${PENDING_KEY_PREFIX}${userId}`;
}

export function readPendingCardAttempt(userId: string): PendingCardAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(pendingCardAttemptKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { paymentAttemptId?: unknown }).paymentAttemptId === "string"
    ) {
      return { paymentAttemptId: (parsed as PendingCardAttempt).paymentAttemptId };
    }
    return null;
  } catch {
    return null;
  }
}

export function writePendingCardAttempt(userId: string, paymentAttemptId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      pendingCardAttemptKey(userId),
      JSON.stringify({ paymentAttemptId })
    );
  } catch {
    // Best-effort only — worst case, Back/refresh recovery for this one
    // attempt doesn't work, not that anything breaks.
  }
}

export function clearPendingCardAttempt(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(pendingCardAttemptKey(userId));
  } catch {
    // Best-effort only.
  }
}
