import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrderIdempotencyActor,
  hashOrderRequest,
  parseOrderIdempotencyKey,
} from "../lib/orders/idempotency.ts";

test("checkout idempotency accepts only UUIDv4 keys and normalizes their case", () => {
  assert.equal(
    parseOrderIdempotencyKey("550E8400-E29B-41D4-A716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000"
  );
  assert.equal(parseOrderIdempotencyKey("550e8400-e29b-11d4-a716-446655440000"), null);
  assert.equal(parseOrderIdempotencyKey("not-a-uuid"), null);
  assert.equal(parseOrderIdempotencyKey(null), null);
});

test("request hashes are canonical across object key order but change with the payload", () => {
  const first = hashOrderRequest({ shipping: { email: "a@example.com" }, quantity: 1 });
  const same = hashOrderRequest({ quantity: 1, shipping: { email: "a@example.com" } });
  const changed = hashOrderRequest({ quantity: 2, shipping: { email: "a@example.com" } });

  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test("idempotency actors are scoped to a user or a non-reversible guest email digest", () => {
  assert.equal(
    buildOrderIdempotencyActor("11111111-1111-4111-8111-111111111111", "ignored@example.com"),
    "user:11111111-1111-4111-8111-111111111111"
  );

  const guest = buildOrderIdempotencyActor(null, " Guest@Example.com ");
  assert.match(guest, /^guest:[0-9a-f]{64}$/);
  assert.doesNotMatch(guest, /guest@example\.com/i);
  assert.equal(guest, buildOrderIdempotencyActor(null, "guest@example.com"));
});
