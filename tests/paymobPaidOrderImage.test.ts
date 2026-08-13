import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static verification that a card-paid order's order_items actually carry
// the product's real image, instead of the '' every card order got before
// this fix (supabase/migrations/20260812000005_fix_paid_order_item_images.sql)
// — see tests/paymobIntentionCart.test.ts for the function-level coverage
// of the TypeScript half of this same bug (ResolvedIntentionLine/
// ProductLookupRow never carried an image at all).

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

const MIGRATION_PATH = "supabase/migrations/20260812000005_fix_paid_order_item_images.sql";
const migration = read(MIGRATION_PATH);

test("the fix migration redefines place_paid_order with its exact original signature and security posture", () => {
  assert.match(migration, /create or replace function public\.place_paid_order\(p_payment_attempt_id uuid\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.place_paid_order\(uuid\) from public, anon, authenticated;\s*\n\s*grant execute on function public\.place_paid_order\(uuid\) to service_role;/
  );
});

test("order_items.image is populated from the cart snapshot, not hardcoded to ''", () => {
  const fn = migration.match(/create or replace function public\.place_paid_order\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /coalesce\(v_item ->> 'image', ''\)/);

  // The specific bug: an unconditional bare '' as the last value in the
  // order_items INSERT's VALUES list (image is the final column).
  const insertMatch = fn.match(/insert into public\.order_items \([\s\S]*?\);/i);
  assert.ok(insertMatch, "expected an order_items INSERT in place_paid_order");
  assert.doesNotMatch(insertMatch![0], /,\s*''\s*\)\s*;/, "image must not be a hardcoded empty string");
});

test("the fix does not touch bucketing, stock decrement, or shipping — only the image column changed", () => {
  const fn = migration.match(/create or replace function public\.place_paid_order\([\s\S]*?\n\$\$;/i)![0];
  const compacted = compact(fn);
  assert.ok(compacted.includes("__mahaly_pool__"));
  assert.ok(compacted.includes("quantity=quantity-v_quantity"));
  assert.ok(compacted.includes("onconflict(payment_attempt_id,bucket_key)doupdateset"));
  assert.ok(compacted.includes("exceptionwhenothersthen"));
});

test("Paymob intention resolves the selected color image and falls back to the product cover", () => {
  const route = read("app/api/payments/paymob/intention/route.ts");
  const selectMatch = route.match(/\.select\(\s*\n?\s*"([^"]*)"/);
  assert.ok(selectMatch, "expected a .select(...) call for the products query");
  assert.match(selectMatch![1], /\bimage\b/);

  const intentionCart = read("lib/payments/intentionCart.ts");
  assert.match(intentionCart, /export interface ProductLookupRow \{[\s\S]*?image: string;[\s\S]*?\}/);
  assert.match(intentionCart, /export interface ResolvedIntentionLine \{[\s\S]*?image: string;[\s\S]*?\}/);
  assert.match(intentionCart, /color_images_by_option_value_id/);
  assert.match(intentionCart, /\]\s*\?\? product\.image,/);
});
