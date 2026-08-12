import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static verification of the cart-reconciliation snapshot-read migration
// — not applied anywhere in this environment, same established pattern
// as tests/paymentAttemptsSchema.test.ts and tests/paymobWebhookSchema.
// test.ts.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

function compact(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, "");
}

const MIGRATION_PATH = "supabase/migrations/20260812000003_cart_reconciliation_snapshot_read.sql";
const migration = read(MIGRATION_PATH);
const sql = compact(migration);

test("get_fulfilled_cart_snapshot_items is security definer, search_path-locked, and stable (read-only)", () => {
  assert.match(migration, /create or replace function public\.get_fulfilled_cart_snapshot_items\(p_payment_attempt_id uuid\)/);
  assert.ok(sql.includes("securitydefiner"));
  assert.ok(sql.includes("setsearch_path=''"));
  assert.ok(sql.includes("stable"));
});

test("ownership is enforced inside the function itself (pa.user_id = auth.uid()) — never trusts the caller's claimed id", () => {
  assert.ok(sql.includes("pa.user_id=(selectauth.uid())"));
});

test("only ever returns rows once status = 'fulfilled' — nothing is readable before real fulfillment, and never for a partial/failed/pending attempt", () => {
  assert.ok(sql.includes("andpa.status='fulfilled'"));
});

test("returns only the four safe fields (productId/size/color/quantity derived from cart_snapshot) — never price, name, brand, or any other snapshot field", () => {
  assert.match(migration, /returns table \(product_id text, size text, color text, quantity int\)/);
  assert.doesNotMatch(migration, /item->>'price'/);
  assert.doesNotMatch(migration, /item->>'name'/);
  assert.doesNotMatch(migration, /item->>'brand/);
});

test("granted only to authenticated and service_role — never anon or public", () => {
  assert.ok(sql.includes("revokeallonfunctionpublic.get_fulfilled_cart_snapshot_items(uuid)frompublic;"));
  assert.ok(sql.includes("grantexecuteonfunctionpublic.get_fulfilled_cart_snapshot_items(uuid)toauthenticated,service_role;"));
  assert.doesNotMatch(migration, /to anon\b/);
});

test("never defines or alters place_order, mark_payment_attempt_paid, or the webhook route's own RPCs — this migration is read-only and additive", () => {
  assert.doesNotMatch(migration, /create (or replace )?function public\.place_order/i);
  assert.doesNotMatch(migration, /create (or replace )?function public\.mark_payment_attempt_paid/i);
  assert.doesNotMatch(migration, /drop function/i);
  assert.doesNotMatch(migration, /drop table/i);
  assert.doesNotMatch(migration, /alter table/i);
});
