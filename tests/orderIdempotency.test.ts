import assert from "node:assert/strict";
import test from "node:test";
import { readOrderIdempotency, storeOrderIdempotency } from "../lib/orders/idempotency.ts";

test("replays a successful order for a valid checkout key", () => {
  const key = "f4ecfb38-ec48-4db4-9eb2-acde71c52a55";
  assert.equal(readOrderIdempotency(key), null);
  storeOrderIdempotency(key, { orderNumbers: ["MH-1001"], orderGroupId: "group-1" });
  assert.deepEqual(readOrderIdempotency(key), { orderNumbers: ["MH-1001"], orderGroupId: "group-1" });
});

test("ignores malformed idempotency keys", () => {
  storeOrderIdempotency("shared-key", { orderNumbers: ["MH-1002"], orderGroupId: "group-2" });
  assert.equal(readOrderIdempotency("shared-key"), null);
});
