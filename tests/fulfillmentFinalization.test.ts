import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relativePath: string) => readFileSync(path.join(rootDir, relativePath), "utf8");

const permissions = read("supabase/migrations/20260814000005_inventory_permission_boundaries.sql");
const mode = read("supabase/migrations/20260814000002_fulfillment_mode.sql");
const coordination = read("supabase/migrations/20260814000007_payment_transition_coordination.sql");
const intention = read("lib/payments/createIntentionForCart.ts");

test("the final fulfillment migration preserves COD and card pricing snapshots instead of reverting the earlier pricing migration", () => {
  const snapshotInsert = /original_unit_price, discount_percent_snapshot, discount_source, item_coupon_discount_egp/g;
  assert.equal((permissions.match(snapshotInsert) ?? []).length, 2, "both COD and paid-order item inserts must retain snapshots");
  assert.match(permissions, /coupon_code = case when v_bucket_discount_egp > 0 then v_coupon_code else null end/);
  assert.match(permissions, /round\(\(v_subtotal_egp - v_bucket_discount_egp \+ v_shipping_fee\) \* 100\)::int/);
});

test("COD per-line coupon allocation divides by the preserved bucket subtotal, never the reset running subtotal", () => {
  assert.match(permissions, /v_bucket_subtotal_egp := v_subtotal_egp;/);
  assert.match(
    permissions,
    /v_item_coupon_discount := round\(v_bucket_discount \* \(v_price \* v_quantity\) \/ v_bucket_subtotal_egp, 2\);/
  );
  assert.doesNotMatch(
    permissions,
    /v_item_coupon_discount := round\(v_bucket_discount \* \(v_price \* v_quantity\) \/ v_subtotal_egp, 2\);/
  );
  assert.match(permissions, /if v_subtotal_egp > 0 then\s+v_last_discount_bucket_key := v_bucket_key;/);
  assert.match(permissions, /if v_bucket_key = v_last_discount_bucket_key then/);
});

test("payment creation and fulfillment transition use the same ordered brand-row lock boundary", () => {
  assert.match(coordination, /from public\.brands b[\s\S]*?order by b\.id[\s\S]*?for update of b/);
  assert.match(coordination, /raise exception 'FULFILLMENT_TRANSITION_BLOCKS_PAYMENT';/);
  assert.match(mode, /select fulfillment_mode into v_from_mode from public\.brands where id = p_brand_id for update;/);
});

test("stale pre-charge attempts stop blocking transitions and have an explicit reconciliation RPC", () => {
  assert.match(mode, /pa\.status in \('created', 'pending'\)[\s\S]*?pa\.expires_at > pg_catalog\.now\(\)/);
  assert.match(coordination, /create or replace function public\.expire_stale_payment_attempts/);
  assert.match(coordination, /where status in \('created', 'pending'\)[\s\S]*?and expires_at <= pg_catalog\.now\(\)/);
  assert.match(coordination, /set status = 'expired'/);
});

test("the idempotency request hash includes the coupon selection", () => {
  assert.match(intention, /hashOrderRequest\(\{ items, shipping, couponCode \}\)/);
});
