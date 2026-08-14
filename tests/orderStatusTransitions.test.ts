import test from "node:test";
import assert from "node:assert/strict";
import { getValidOrderStatusOptions } from "../lib/admin/statuses.ts";

for (const fulfillmentType of ["brand_direct", "mahaly_pool"] as const) {
  test(`confirmed follows the same fulfillment vocabulary for ${fulfillmentType}`, () => {
    assert.deepEqual(getValidOrderStatusOptions("confirmed", fulfillmentType), ["confirmed", "preparing", "cancelled"]);
  });

  test(`preparing moves to ready for pickup for ${fulfillmentType}`, () => {
    assert.deepEqual(getValidOrderStatusOptions("preparing", fulfillmentType), ["preparing", "ready_for_pickup", "cancelled"]);
  });

  test(`ready for pickup moves to on the way for ${fulfillmentType}`, () => {
    assert.deepEqual(getValidOrderStatusOptions("ready_for_pickup", fulfillmentType), ["ready_for_pickup", "shipped", "cancelled"]);
  });
}

test("shipped can only become delivered", () => {
  assert.deepEqual(getValidOrderStatusOptions("shipped", "brand_direct"), ["shipped", "fulfilled"]);
});

test("terminal statuses remain terminal", () => {
  assert.deepEqual(getValidOrderStatusOptions("fulfilled", "brand_direct"), ["fulfilled"]);
  assert.deepEqual(getValidOrderStatusOptions("cancelled", "brand_direct"), ["cancelled"]);
});

test("legacy pending/paid rows render safely until the migration backfill runs", () => {
  assert.deepEqual(getValidOrderStatusOptions("pending", "brand_direct"), ["pending", "preparing", "cancelled"]);
  assert.deepEqual(getValidOrderStatusOptions("paid", "brand_direct"), ["paid", "preparing", "cancelled"]);
});
