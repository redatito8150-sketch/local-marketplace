import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260814005651_unified_order_lifecycle.sql", import.meta.url),
  "utf8"
);
const brandRoute = readFileSync(new URL("../app/api/brand-portal/orders/[id]/status/route.ts", import.meta.url), "utf8");
const cancelRoute = readFileSync(new URL("../app/api/brand-portal/orders/[id]/cancel/route.ts", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../app/checkout/page.tsx", import.meta.url), "utf8");

test("migration backfills legacy fulfillment states and enforces the canonical lifecycle", () => {
  assert.match(migration, /set status = 'confirmed'[\s\S]*where status in \('pending', 'paid'\)/i);
  assert.match(migration, /'confirmed', 'preparing', 'ready_for_pickup', 'shipped', 'fulfilled', 'cancelled'/i);
  assert.match(migration, /v_current_status = 'confirmed' and p_new_status = 'preparing'/i);
  assert.match(migration, /v_current_status = 'preparing' and p_new_status = 'ready_for_pickup'/i);
  assert.match(migration, /v_current_status = 'ready_for_pickup' and p_new_status = 'shipped'/i);
});

test("COD collection remains atomic with successful delivery", () => {
  assert.match(migration, /p_new_status = 'fulfilled' and v_payment_method = 'cash_on_delivery'/i);
  assert.match(migration, /payment_collection_source[\s\S]*'delivery_confirmation'/i);
});

test("brand actions stop at ready for pickup and cancellation requires a reason", () => {
  assert.match(brandRoute, /confirmed: "preparing"/);
  assert.match(brandRoute, /preparing: "ready_for_pickup"/);
  assert.doesNotMatch(brandRoute, /preparing: "shipped"/);
  assert.match(cancelRoute, /reason\.length < 5/);
  assert.match(migration, /create or replace function public\.cancel_brand_order/i);
  assert.match(migration, /public\.cancel_order\(p_order_id\)/i);
});

test("new orders are normalized even while legacy placement RPC bodies still insert pending or paid", () => {
  assert.match(migration, /before insert or update of status on public\.orders/i);
  assert.match(migration, /if new\.status in \('pending', 'paid'\)/i);
  assert.match(migration, /normalize_order_history_fulfillment_status/i);
});

test("checkout labels completion separately from payment collection", () => {
  assert.match(checkout, /label: "Payment method"/);
  assert.match(checkout, /label: "Order placed"/);
  assert.match(checkout, /Cash due on delivery/);
});

test("new security-definer RPC is service-role only", () => {
  assert.match(migration, /revoke all on function public\.cancel_brand_order[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.cancel_brand_order[\s\S]*to service_role/i);
});
