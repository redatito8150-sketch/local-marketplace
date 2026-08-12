import test from "node:test";
import assert from "node:assert/strict";
import { getValidOrderStatusOptions } from "../lib/admin/statuses.ts";

// getValidOrderStatusOptions must mirror public.transition_order_status()'s
// allowed-transition matrix (supabase/migrations/
// 20260810000005_order_integrity_and_idempotency.sql) and
// public.cancel_order()'s own status guard exactly — this is what the
// admin order detail page's status dropdown is built from. Before this
// fix, the dropdown listed every ORDER_STATUS unconditionally, so picking
// an option invalid for the order's fulfillment_type (e.g. "Preparing"
// for a Zakhnook-pool order, which the RPC only allows for brand_direct)
// always failed with INVALID_ORDER_TRANSITION — indistinguishable, from
// the admin's side, from "the status can't be changed at all."

test("pending -> only paid or cancelled are offered, for either fulfillment type", () => {
  assert.deepEqual(getValidOrderStatusOptions("pending", "brand_direct"), ["pending", "paid", "cancelled"]);
  assert.deepEqual(getValidOrderStatusOptions("pending", "mahaly_pool"), ["pending", "paid", "cancelled"]);
});

test("paid + brand_direct -> preparing (not shipped) is offered — the RPC rejects paid->shipped for a brand_direct order", () => {
  assert.deepEqual(getValidOrderStatusOptions("paid", "brand_direct"), ["paid", "preparing", "cancelled"]);
});

test("paid + mahaly_pool (the Zakhnook pool bug scenario) -> shipped (not preparing) is offered — the RPC rejects paid->preparing for a pool order", () => {
  assert.deepEqual(getValidOrderStatusOptions("paid", "mahaly_pool"), ["paid", "shipped", "cancelled"]);
});

test("preparing -> only shipped or cancelled, for either fulfillment type (a brand_direct-only state, but the function must not crash on mahaly_pool either)", () => {
  assert.deepEqual(getValidOrderStatusOptions("preparing", "brand_direct"), ["preparing", "shipped", "cancelled"]);
  assert.deepEqual(getValidOrderStatusOptions("preparing", "mahaly_pool"), ["preparing", "shipped", "cancelled"]);
});

test("shipped -> only fulfilled — cancel_order() explicitly rejects CANNOT_CANCEL_SHIPPED, so cancelled must not be offered", () => {
  assert.deepEqual(getValidOrderStatusOptions("shipped", "brand_direct"), ["shipped", "fulfilled"]);
  assert.deepEqual(getValidOrderStatusOptions("shipped", "mahaly_pool"), ["shipped", "fulfilled"]);
});

test("fulfilled is terminal — only itself is offered (cancel_order() rejects CANNOT_CANCEL_FULFILLED, and no forward transition exists)", () => {
  assert.deepEqual(getValidOrderStatusOptions("fulfilled", "brand_direct"), ["fulfilled"]);
  assert.deepEqual(getValidOrderStatusOptions("fulfilled", "mahaly_pool"), ["fulfilled"]);
});

test("cancelled is terminal — only itself is offered (cancel_order() rejects ALREADY_CANCELLED)", () => {
  assert.deepEqual(getValidOrderStatusOptions("cancelled", "brand_direct"), ["cancelled"]);
  assert.deepEqual(getValidOrderStatusOptions("cancelled", "mahaly_pool"), ["cancelled"]);
});

test("the current status is always the first option, so the dropdown always shows the order's real current value", () => {
  for (const status of ["pending", "paid", "preparing", "shipped", "fulfilled", "cancelled"] as const) {
    for (const type of ["brand_direct", "mahaly_pool"] as const) {
      assert.equal(getValidOrderStatusOptions(status, type)[0], status);
    }
  }
});
