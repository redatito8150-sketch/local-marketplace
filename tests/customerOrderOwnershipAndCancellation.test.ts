import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260814000012_customer_order_ownership_and_cancellation.sql"),
  "utf8"
);

test("guest-order recovery requires a matching confirmed auth email", () => {
  assert.match(migration, /email_confirmed_at is not null/i);
  assert.match(migration, /v_auth_email <> lower\(btrim\(p_email\)\)/i);
  assert.match(migration, /where o\.user_id is null/i);
  assert.match(migration, /sibling\.user_id <> p_user_id/i);
});

test("customer cancellation is owner-scoped, COD-only, and pre-shipment", () => {
  assert.match(migration, /v_owner_id is distinct from p_user_id/i);
  assert.match(migration, /payment_method <> 'cash_on_delivery'/i);
  assert.match(migration, /status not in \('pending', 'preparing', 'cancelled'\)/i);
  assert.match(migration, /payment_status <> 'unpaid'/i);
  assert.match(migration, /perform public\.cancel_order\(v_order\.id\)/i);
});

test("new ownership functions remain service-role only", () => {
  assert.match(migration, /revoke all on function public\.claim_guest_orders_for_account\(uuid, text\)[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.cancel_customer_master_order\(uuid, uuid\)[\s\S]*from public, anon, authenticated/i);
});
