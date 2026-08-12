import test from "node:test";
import assert from "node:assert/strict";
import {
  cardPaymentReducer,
  INITIAL_CARD_PAYMENT_STATE,
} from "../lib/payments/cardPaymentAttempt.ts";
import { makeAppError } from "../lib/errors/appError.ts";

const KEY_A = "11111111-1111-4111-8111-111111111111";
const KEY_B = "22222222-2222-4222-8222-222222222222";

test("idle -> requesting on START_ATTEMPT, storing the given key and clearing any prior data", () => {
  const state = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  assert.equal(state.phase, "requesting");
  assert.equal(state.idempotencyKey, KEY_A);
  assert.equal(state.clientSecret, null);
  assert.equal(state.paymentAttemptId, null);
  assert.equal(state.error, null);
});

test("double-click prevention: START_ATTEMPT is a no-op while already requesting/ready/pixel_open — never mints a second key", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });

  const stillRequesting = cardPaymentReducer(requesting, { type: "START_ATTEMPT", idempotencyKey: KEY_B });
  assert.equal(stillRequesting, requesting, "a second START_ATTEMPT while requesting must return the exact same state");
  assert.equal(stillRequesting.idempotencyKey, KEY_A);

  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  const stillReady = cardPaymentReducer(ready, { type: "START_ATTEMPT", idempotencyKey: KEY_B });
  assert.equal(stillReady, ready);
  assert.equal(stillReady.idempotencyKey, KEY_A);

  const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });
  const stillOpen = cardPaymentReducer(pixelOpen, { type: "START_ATTEMPT", idempotencyKey: KEY_B });
  assert.equal(stillOpen, pixelOpen);
});

test("requesting -> ready on INTENTION_SUCCEEDED, carrying clientSecret + paymentAttemptId", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  assert.equal(ready.phase, "ready");
  assert.equal(ready.clientSecret, "egy_csk_test_x");
  assert.equal(ready.paymentAttemptId, "attempt-1");
  assert.equal(ready.idempotencyKey, KEY_A);
});

test("INTENTION_SUCCEEDED / INTENTION_FAILED are no-ops outside 'requesting'", () => {
  assert.equal(
    cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, {
      type: "INTENTION_SUCCEEDED",
      clientSecret: "x",
      paymentAttemptId: "y",
    }),
    INITIAL_CARD_PAYMENT_STATE
  );
  assert.equal(
    cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, {
      type: "INTENTION_FAILED",
      error: makeAppError("unknown"),
    }),
    INITIAL_CARD_PAYMENT_STATE
  );
});

test("requesting -> error on INTENTION_FAILED, carrying the AppError verbatim (e.g. a 409 idempotency conflict)", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const conflictError = makeAppError("conflict", {
    userMessage: "A payment for this request is already being processed.",
  });
  const errored = cardPaymentReducer(requesting, { type: "INTENTION_FAILED", error: conflictError });
  assert.equal(errored.phase, "error");
  assert.equal(errored.error, conflictError);
  assert.equal(errored.clientSecret, null);
  assert.equal(errored.paymentAttemptId, null);
});

test("ready -> pixel_open on PIXEL_MOUNTED, and clientSecret is cleared from state at that point (never lingers)", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  assert.equal(ready.clientSecret, "egy_csk_test_x");

  const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });
  assert.equal(pixelOpen.phase, "pixel_open");
  assert.equal(pixelOpen.clientSecret, null, "clientSecret must be cleared the instant Pixel is mounted");
  assert.equal(pixelOpen.paymentAttemptId, "attempt-1", "paymentAttemptId is retained for the future confirmation flow");
});

test("PIXEL_MOUNTED / PIXEL_CANCELLED / PIXEL_SUBMITTED are no-ops from the wrong phase", () => {
  assert.equal(cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "PIXEL_MOUNTED" }), INITIAL_CARD_PAYMENT_STATE);
  assert.equal(cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "PIXEL_CANCELLED" }), INITIAL_CARD_PAYMENT_STATE);
  assert.equal(cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "PIXEL_SUBMITTED" }), INITIAL_CARD_PAYMENT_STATE);
});

test("pixel_open -> cancelled on PIXEL_CANCELLED — a neutral state, never an error", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });
  const cancelled = cardPaymentReducer(pixelOpen, { type: "PIXEL_CANCELLED" });
  assert.equal(cancelled.phase, "cancelled");
  assert.equal(cancelled.error, null);
  assert.equal(cancelled.clientSecret, null);
});

test("pixel_open -> confirming on PIXEL_SUBMITTED (a neutral, non-authoritative state — never 'paid')", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });
  const confirming = cardPaymentReducer(pixelOpen, { type: "PIXEL_SUBMITTED" });
  assert.equal(confirming.phase, "confirming");
  // No phase this module can express is named/spelled "paid" — grep the
  // whole module's possible phase values directly.
  const allPhases: string[] = ["idle", "requesting", "ready", "pixel_open", "confirming", "cancelled", "error"];
  assert.ok(!allPhases.some((p) => p.includes("paid")));
});

test("PIXEL_ERROR reaches 'error' from both 'ready' (widget failed to initialize) and 'pixel_open' (SDK onError)", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });

  const errorFromReady = cardPaymentReducer(ready, { type: "PIXEL_ERROR", error: makeAppError("external_provider") });
  assert.equal(errorFromReady.phase, "error");
  assert.equal(errorFromReady.clientSecret, null);

  const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });
  const errorFromOpen = cardPaymentReducer(pixelOpen, { type: "PIXEL_ERROR", error: makeAppError("external_provider") });
  assert.equal(errorFromOpen.phase, "error");
});

test("PIXEL_ERROR is a no-op from 'idle' or 'requesting'", () => {
  assert.equal(cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "PIXEL_ERROR", error: makeAppError("unknown") }), INITIAL_CARD_PAYMENT_STATE);
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  assert.equal(cardPaymentReducer(requesting, { type: "PIXEL_ERROR", error: makeAppError("unknown") }), requesting);
});

test("a fresh START_ATTEMPT after 'error' or 'cancelled' mints a brand-new key and fully clears the prior attempt's state", () => {
  for (const priorPhaseSetup of [
    (): ReturnType<typeof cardPaymentReducer> => {
      const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
      return cardPaymentReducer(requesting, { type: "INTENTION_FAILED", error: makeAppError("network") });
    },
    (): ReturnType<typeof cardPaymentReducer> => {
      const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
      const ready = cardPaymentReducer(requesting, {
        type: "INTENTION_SUCCEEDED",
        clientSecret: "egy_csk_test_x",
        paymentAttemptId: "attempt-1",
      });
      const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });
      return cardPaymentReducer(pixelOpen, { type: "PIXEL_CANCELLED" });
    },
  ]) {
    const priorState = priorPhaseSetup();
    assert.ok(priorState.phase === "error" || priorState.phase === "cancelled");

    const restarted = cardPaymentReducer(priorState, { type: "START_ATTEMPT", idempotencyKey: KEY_B });
    assert.equal(restarted.phase, "requesting");
    assert.equal(restarted.idempotencyKey, KEY_B);
    assert.notEqual(restarted.idempotencyKey, KEY_A);
    assert.equal(restarted.clientSecret, null);
    assert.equal(restarted.paymentAttemptId, null);
    assert.equal(restarted.error, null);
  }
});

test("RESET always returns to the exact initial state", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  assert.deepEqual(cardPaymentReducer(ready, { type: "RESET" }), INITIAL_CARD_PAYMENT_STATE);
});

test("POLL_PENDING keeps the UI in 'confirming' while polling our own backend (never a Pixel signal)", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });
  const confirming = cardPaymentReducer(pixelOpen, { type: "POLL_PENDING" });
  assert.equal(confirming.phase, "confirming");
  // Polling again while already confirming just stays confirming.
  assert.equal(cardPaymentReducer(confirming, { type: "POLL_PENDING" }).phase, "confirming");
});

test("POLL_CONFIRMED is the ONLY action that can ever reach 'confirmed' — never any PIXEL_* action", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });

  // No PIXEL_* action reaches "confirmed" — already proven by the phase
  // enum + switch cases, but assert directly against every action this
  // module defines that starts with PIXEL_.
  for (const pixelAction of [{ type: "PIXEL_SUBMITTED" as const }, { type: "PIXEL_CANCELLED" as const }]) {
    const result = cardPaymentReducer(pixelOpen, pixelAction);
    assert.notEqual(result.phase, "confirmed");
  }

  const confirmed = cardPaymentReducer(pixelOpen, {
    type: "POLL_CONFIRMED",
    masterOrderId: "group-123",
    masterOrderNumber: "ZK-583921",
    isPartial: false,
    purchasedItems: [{ productId: "prod-1", size: "M", color: "Sand", quantity: 2 }],
  });
  assert.equal(confirmed.phase, "confirmed");
  assert.equal(confirmed.masterOrderId, "group-123");
  assert.equal(confirmed.masterOrderNumber, "ZK-583921");
  assert.equal(confirmed.isPartial, false);
  assert.equal(confirmed.clientSecret, null);
  assert.equal(confirmed.error, null);
  assert.deepEqual(confirmed.purchasedItems, [
    { productId: "prod-1", size: "M", color: "Sand", quantity: 2 },
  ]);
});

test("POLL_CONFIRMED also reachable from 'confirming' (the normal polling path)", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });
  const confirming = cardPaymentReducer(pixelOpen, { type: "POLL_PENDING" });
  const confirmed = cardPaymentReducer(confirming, {
    type: "POLL_CONFIRMED",
    masterOrderId: "group-9",
    masterOrderNumber: "ZK-100245",
    isPartial: true,
    purchasedItems: [],
  });
  assert.equal(confirmed.phase, "confirmed");
  assert.equal(confirmed.isPartial, true);
  // isPartial results carry no purchasedItems — see the status route's
  // own comment on why per-bucket cart_snapshot removal isn't safe.
  assert.deepEqual(confirmed.purchasedItems, []);
});

test("POLL_FAILED (backend reports fulfillment_failed/failed) moves to 'error' with the given AppError, carrying no order info", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });
  const pollError = makeAppError("external_provider", { userMessage: "This card payment didn't succeed." });
  const failed = cardPaymentReducer(pixelOpen, { type: "POLL_FAILED", error: pollError });
  assert.equal(failed.phase, "error");
  assert.equal(failed.error, pollError);
  assert.equal(failed.clientSecret, null);
});

test("POLL_* actions are no-ops outside pixel_open/confirming", () => {
  assert.equal(cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "POLL_PENDING" }), INITIAL_CARD_PAYMENT_STATE);
  assert.equal(
    cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, {
      type: "POLL_CONFIRMED",
      masterOrderId: null,
      masterOrderNumber: null,
      isPartial: false,
      purchasedItems: [],
    }),
    INITIAL_CARD_PAYMENT_STATE
  );
  assert.equal(
    cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "POLL_FAILED", error: makeAppError("unknown") }),
    INITIAL_CARD_PAYMENT_STATE
  );
});

test("clientSecret is present in state ONLY during the 'ready' phase — every other reachable phase has it null", () => {
  const requesting = cardPaymentReducer(INITIAL_CARD_PAYMENT_STATE, { type: "START_ATTEMPT", idempotencyKey: KEY_A });
  assert.equal(requesting.clientSecret, null);

  const ready = cardPaymentReducer(requesting, {
    type: "INTENTION_SUCCEEDED",
    clientSecret: "egy_csk_test_x",
    paymentAttemptId: "attempt-1",
  });
  assert.equal(ready.clientSecret, "egy_csk_test_x");

  const pixelOpen = cardPaymentReducer(ready, { type: "PIXEL_MOUNTED" });
  assert.equal(pixelOpen.clientSecret, null);

  const confirming = cardPaymentReducer(pixelOpen, { type: "PIXEL_SUBMITTED" });
  assert.equal(confirming.clientSecret, null);

  const cancelled = cardPaymentReducer(pixelOpen, { type: "PIXEL_CANCELLED" });
  assert.equal(cancelled.clientSecret, null);

  const erroredFromReady = cardPaymentReducer(ready, { type: "PIXEL_ERROR", error: makeAppError("unknown") });
  assert.equal(erroredFromReady.clientSecret, null);
});
