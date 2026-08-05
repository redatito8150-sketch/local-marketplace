import test from "node:test";
import assert from "node:assert/strict";
import { makeAppError, generateCorrelationId, CATEGORY_STATUS } from "../lib/errors/appError.ts";
import { parseApiError } from "../lib/errors/client.ts";
import { normalizeAuthError } from "../lib/errors/authMessages.ts";

test("makeAppError: fills in a safe default userMessage per category", () => {
  const error = makeAppError("network");
  assert.equal(error.category, "network");
  assert.match(error.userMessage, /connect/i);
  assert.equal(error.retryable, true);
});

test("makeAppError: an explicit userMessage always wins over the default", () => {
  const error = makeAppError("validation", { userMessage: "Product Name is required." });
  assert.equal(error.userMessage, "Product Name is required.");
});

test("makeAppError: retryable defaults follow the category, but can be overridden", () => {
  assert.equal(makeAppError("network").retryable, true, "network is retryable by default");
  assert.equal(makeAppError("authorization").retryable, false, "authorization is not retryable by default");
  assert.equal(makeAppError("authorization", { retryable: true }).retryable, true, "explicit override wins");
});

test("makeAppError: never leaks technical detail into userMessage for any category", () => {
  const categories = Object.keys(CATEGORY_STATUS) as (keyof typeof CATEGORY_STATUS)[];
  for (const category of categories) {
    const error = makeAppError(category);
    assert.doesNotMatch(error.userMessage, /postgres|supabase|sql|constraint|column|table|stack/i, `${category}'s default message must stay safe`);
  }
});

test("generateCorrelationId: short, uppercase, no ambiguous characters", () => {
  const id = generateCorrelationId();
  assert.equal(id.length, 6);
  assert.match(id, /^[A-Z0-9]+$/);
  assert.doesNotMatch(id, /[0O1I]/, "excludes visually ambiguous characters by design");
});

test("generateCorrelationId: not the same value every call", () => {
  const ids = new Set(Array.from({ length: 20 }, () => generateCorrelationId()));
  assert.ok(ids.size > 1, "20 calls should not all collide");
});

test("parseApiError: uses the server's structured category/fields when present", () => {
  const result = parseApiError(409, {
    error: "This was changed elsewhere. Reload and try again.",
    category: "conflict",
    retryable: false,
  });
  assert.equal(result.category, "conflict");
  assert.equal(result.retryable, false);
  assert.equal(result.userMessage, "This was changed elsewhere. Reload and try again.");
});

test("parseApiError: falls back to inferring category from HTTP status for older/unmigrated routes", () => {
  assert.equal(parseApiError(401, { error: "Not authorized" }).category, "authentication");
  assert.equal(parseApiError(403, { error: "Not authorized" }).category, "authorization");
  assert.equal(parseApiError(404, {}).category, "not_found");
  assert.equal(parseApiError(429, {}).category, "rate_limit");
  assert.equal(parseApiError(500, {}).category, "unknown");
});

test("parseApiError: ignores a category value the client doesn't recognize (forward-compat)", () => {
  const result = parseApiError(400, { error: "x", category: "not-a-real-category" });
  assert.equal(result.category, "validation", "falls back to status-inferred category");
});

test("parseApiError: fieldErrors only passed through when every value is a string", () => {
  const good = parseApiError(400, { error: "x", fieldErrors: { name: "Required" } });
  assert.deepEqual(good.fieldErrors, { name: "Required" });

  const bad = parseApiError(400, { error: "x", fieldErrors: { name: 123 } });
  assert.equal(bad.fieldErrors, undefined);
});

test("normalizeAuthError: invalid credentials maps to a safe, specific authentication error", () => {
  const result = normalizeAuthError("test", { message: "Invalid login credentials" });
  assert.equal(result.category, "authentication");
  assert.equal(result.userMessage, "The email or password is incorrect.");
});

test("normalizeAuthError: Supabase error code takes priority over message text", () => {
  const result = normalizeAuthError("test", { message: "some unrelated text", code: "invalid_credentials" });
  assert.equal(result.userMessage, "The email or password is incorrect.");
});

test("normalizeAuthError: weak password includes field-level detail", () => {
  const result = normalizeAuthError("test", { message: "Password should be at least 6 characters" });
  assert.equal(result.category, "validation");
  assert.ok(result.fieldErrors?.password);
});

test("normalizeAuthError: already-registered email is a non-retryable conflict, not account-enumeration-safe wording", () => {
  const result = normalizeAuthError("test", { message: "User already registered" });
  assert.equal(result.category, "conflict");
  assert.equal(result.retryable, false);
});

test("normalizeAuthError: rate limit maps to the rate_limit category", () => {
  const result = normalizeAuthError("test", { message: "Too many requests" });
  assert.equal(result.category, "rate_limit");
});

test("normalizeAuthError: unmapped/unknown Supabase errors never leak the raw message", () => {
  const rawMessage = "duplicate key value violates unique constraint \"profiles_pkey\"";
  const result = normalizeAuthError("test", { message: rawMessage });
  assert.equal(result.category, "unknown");
  assert.notEqual(result.userMessage, rawMessage);
  assert.doesNotMatch(result.userMessage, /constraint|pkey|duplicate key/i);
});
