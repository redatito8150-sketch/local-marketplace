import test from "node:test";
import assert from "node:assert/strict";

// This module guards every access with `typeof window === "undefined"`,
// so a minimal in-memory sessionStorage fake needs to be installed as the
// global `window` BEFORE importing it — the same "inject a fake external
// system, test the real logic" approach used for localStorage-backed
// browser modules elsewhere in this project's manual QA, just made
// executable here since this module has no other DOM dependency.
class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const fakeSessionStorage = new FakeStorage();
(globalThis as unknown as { window: { sessionStorage: FakeStorage } }).window = {
  sessionStorage: fakeSessionStorage,
};

const {
  readPendingCardAttempt,
  writePendingCardAttempt,
  clearPendingCardAttempt,
} = await import("../lib/payments/pendingCardAttempt.ts");

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

test("readPendingCardAttempt returns null when nothing was ever written for this user", () => {
  assert.equal(readPendingCardAttempt(USER_A), null);
});

test("write then read round-trips the exact paymentAttemptId", () => {
  writePendingCardAttempt(USER_A, "attempt-abc");
  assert.deepEqual(readPendingCardAttempt(USER_A), { paymentAttemptId: "attempt-abc" });
  clearPendingCardAttempt(USER_A);
});

test("a marker written for one user is never visible when reading as a different user — the same account-scoping guarantee as the cart itself", () => {
  writePendingCardAttempt(USER_A, "attempt-for-a");
  assert.equal(readPendingCardAttempt(USER_B), null);
  assert.deepEqual(readPendingCardAttempt(USER_A), { paymentAttemptId: "attempt-for-a" });
  clearPendingCardAttempt(USER_A);
});

test("clearPendingCardAttempt only clears the given user's own marker, never another user's", () => {
  writePendingCardAttempt(USER_A, "attempt-a");
  writePendingCardAttempt(USER_B, "attempt-b");
  clearPendingCardAttempt(USER_A);
  assert.equal(readPendingCardAttempt(USER_A), null);
  assert.deepEqual(readPendingCardAttempt(USER_B), { paymentAttemptId: "attempt-b" });
  clearPendingCardAttempt(USER_B);
});

test("clearing is idempotent — clearing an already-clear marker doesn't throw", () => {
  clearPendingCardAttempt(USER_A);
  assert.doesNotThrow(() => clearPendingCardAttempt(USER_A));
});

test("malformed stored JSON is treated as no marker, not a crash", () => {
  fakeSessionStorage.setItem(`mahaly_pending_card_attempt:${USER_A}`, "{not valid json");
  assert.equal(readPendingCardAttempt(USER_A), null);
  fakeSessionStorage.removeItem(`mahaly_pending_card_attempt:${USER_A}`);
});

test("a stored value missing paymentAttemptId is treated as no marker", () => {
  fakeSessionStorage.setItem(`mahaly_pending_card_attempt:${USER_A}`, JSON.stringify({ somethingElse: true }));
  assert.equal(readPendingCardAttempt(USER_A), null);
  fakeSessionStorage.removeItem(`mahaly_pending_card_attempt:${USER_A}`);
});

test("writing a new attempt for the same user overwrites (not appends to) the previous marker", () => {
  writePendingCardAttempt(USER_A, "attempt-1");
  writePendingCardAttempt(USER_A, "attempt-2");
  assert.deepEqual(readPendingCardAttempt(USER_A), { paymentAttemptId: "attempt-2" });
  clearPendingCardAttempt(USER_A);
});
