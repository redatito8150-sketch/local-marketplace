// Pure state machine for the checkout page's "pay with card" flow — zero
// DOM/React/fetch dependency, so it's fully unit-testable the same way
// lib/payments/createIntentionForCart.ts is on the server side. The
// checkout page wires this to real browser APIs (fetch, crypto.randomUUID,
// the Paymob Pixel script) via useReducer; this file only decides what
// state transitions are legal.
//
// The critical invariant this file exists to enforce: NEVER trust a Pixel
// signal as payment confirmation. There is no "PAID" phase anywhere below,
// and no action here can ever produce one — the only way `paid` can ever
// become true is a future, separate, HMAC-verified webhook writing
// directly to payment_attempts server-side. This file cannot express that
// state even by mistake.

import type { AppError, PurchasedCartLine } from "../../types/index.ts";

export type CardPaymentPhase =
  | "idle"
  | "requesting"
  | "ready"
  | "pixel_open"
  | "confirming"
  | "confirmed"
  | "cancelled"
  | "error";

export interface CardPaymentState {
  phase: CardPaymentPhase;
  idempotencyKey: string | null;
  paymentAttemptId: string | null;
  // Present only between "ready" and the moment Pixel is constructed —
  // cleared the instant it's handed to the Pixel SDK (see PIXEL_MOUNTED).
  // Never read anywhere else once cleared.
  clientSecret: string | null;
  error: AppError | null;
  // Set only by POLL_CONFIRMED — i.e. only once our OWN backend (whose
  // status is itself only ever set by the HMAC-verified webhook) reports
  // the attempt fulfilled. Never set from any Pixel-originated signal.
  masterOrderId: string | null;
  masterOrderNumber: string | null;
  isPartial: boolean;
  // The exact lines (productId/size/color/quantity) this attempt's own
  // cart_snapshot says were paid for — empty whenever isPartial is true,
  // since there's no safe per-bucket mapping to know which lines those
  // buckets actually cover (see the status route's own comment). Read
  // by app/checkout/page.tsx's cart-clearing effect to call
  // removePurchasedItems() instead of a blind clearCart().
  purchasedItems: PurchasedCartLine[];
}

export const INITIAL_CARD_PAYMENT_STATE: CardPaymentState = {
  phase: "idle",
  idempotencyKey: null,
  paymentAttemptId: null,
  clientSecret: null,
  error: null,
  masterOrderId: null,
  masterOrderNumber: null,
  isPartial: false,
  purchasedItems: [],
};

export type CardPaymentAction =
  | { type: "START_ATTEMPT"; idempotencyKey: string }
  | { type: "INTENTION_SUCCEEDED"; clientSecret: string; paymentAttemptId: string }
  | { type: "INTENTION_FAILED"; error: AppError }
  | { type: "PIXEL_MOUNTED" }
  // Not reachable in paymob-pixel@1.2.7 today — that SDK version exposes
  // no payment-completion callback at all (only onError/onCancel; see the
  // Phase 2 report). Kept so a neutral "confirming" state exists to wire a
  // future SDK event into, per the approved architecture's "at most show a
  // neutral state ... if the Pixel reports completion" requirement —
  // without ever inventing a signal that isn't actually there today.
  | { type: "PIXEL_SUBMITTED" }
  | { type: "PIXEL_CANCELLED" }
  | { type: "PIXEL_ERROR"; error: AppError }
  // Driven by polling GET /api/payments/paymob/attempts/[id] — a read of
  // our own backend's already-authoritative state, never a Pixel signal.
  // This is the ONLY path that can ever reach "confirmed".
  | { type: "POLL_PENDING" }
  | {
      type: "POLL_CONFIRMED";
      masterOrderId: string | null;
      masterOrderNumber: string | null;
      isPartial: boolean;
      purchasedItems: PurchasedCartLine[];
    }
  | { type: "POLL_FAILED"; error: AppError }
  | { type: "RESET" };

// Only these phases may start a brand-new attempt (and mint a new
// Idempotency-Key). Every other phase means a request is already in
// flight or an attempt is already ready/open — starting again here would
// either duplicate a Create Intention call or mint a second Paymob
// intention for the same checkout, both of which the approved
// architecture forbids. This is the reducer-level half of double-click
// prevention; the checkout page adds a synchronous ref guard on top for
// the real-browser-event-timing case a pure reducer can't cover.
const RESTARTABLE_PHASES: ReadonlySet<CardPaymentPhase> = new Set(["idle", "cancelled", "error"]);

export function cardPaymentReducer(state: CardPaymentState, action: CardPaymentAction): CardPaymentState {
  switch (action.type) {
    case "START_ATTEMPT":
      if (!RESTARTABLE_PHASES.has(state.phase)) return state;
      return { ...INITIAL_CARD_PAYMENT_STATE, phase: "requesting", idempotencyKey: action.idempotencyKey };

    case "INTENTION_SUCCEEDED":
      if (state.phase !== "requesting") return state;
      return {
        ...state,
        phase: "ready",
        clientSecret: action.clientSecret,
        paymentAttemptId: action.paymentAttemptId,
      };

    case "INTENTION_FAILED":
      if (state.phase !== "requesting") return state;
      return { ...state, phase: "error", error: action.error };

    case "PIXEL_MOUNTED":
      if (state.phase !== "ready") return state;
      return { ...state, phase: "pixel_open", clientSecret: null };

    case "PIXEL_SUBMITTED":
      if (state.phase !== "pixel_open") return state;
      return { ...state, phase: "confirming" };

    case "PIXEL_CANCELLED":
      if (state.phase !== "pixel_open") return state;
      return { ...state, phase: "cancelled", clientSecret: null };

    case "PIXEL_ERROR":
      // Reachable both from "ready" (the widget failed to initialize —
      // missing public key, script load failure) and "pixel_open" (the
      // SDK's own onError callback fired after mounting).
      if (state.phase !== "ready" && state.phase !== "pixel_open") return state;
      return { ...state, phase: "error", clientSecret: null, error: action.error };

    case "POLL_PENDING":
      if (state.phase !== "pixel_open" && state.phase !== "confirming") return state;
      return { ...state, phase: "confirming" };

    case "POLL_CONFIRMED":
      if (state.phase !== "pixel_open" && state.phase !== "confirming") return state;
      return {
        ...state,
        phase: "confirmed",
        clientSecret: null,
        error: null,
        masterOrderId: action.masterOrderId,
        masterOrderNumber: action.masterOrderNumber,
        isPartial: action.isPartial,
        purchasedItems: action.purchasedItems,
      };

    case "POLL_FAILED":
      if (state.phase !== "pixel_open" && state.phase !== "confirming") return state;
      return { ...state, phase: "error", clientSecret: null, error: action.error };

    case "RESET":
      return INITIAL_CARD_PAYMENT_STATE;

    default:
      return state;
  }
}
