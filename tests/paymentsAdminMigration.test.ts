import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

const MIGRATION_PATH = "supabase/migrations/20260813000001_payments_admin_and_order_lock.sql";
const migration = read(MIGRATION_PATH);

test("list_payment_attempt_fulfillments_for_admin is security definer, search_path-locked, and service_role-only", () => {
  const fn = migration.match(
    /create or replace function public\.list_payment_attempt_fulfillments_for_admin\([\s\S]*?\$\$;/i
  )![0];
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path = ''/);
  assert.match(fn, /from private\.payment_attempt_fulfillments f/);
  assert.match(fn, /left join public\.brands b on b\.id = f\.brand_id/);

  assert.match(
    migration,
    /revoke all on function public\.list_payment_attempt_fulfillments_for_admin\(uuid\)\s*\n\s*from public, anon, authenticated;/
  );
  assert.match(
    migration,
    /grant execute on function public\.list_payment_attempt_fulfillments_for_admin\(uuid\)\s*\n\s*to service_role;/
  );
});

test("orders gains an explicit revoke update from authenticated/anon (belt-and-suspenders — RLS already blocked this)", () => {
  assert.match(migration, /revoke update on public\.orders from authenticated, anon;/);
});

test("AdminSidebar links the new /admin/payments index alongside the existing refund-queue entry", () => {
  const sidebar = read("components/admin/AdminSidebar.tsx");
  assert.match(sidebar, /\{ label: "Payments", href: "\/admin\/payments", icon: CreditCard, permission: "manage_orders" \}/);
  assert.match(sidebar, /"\/admin\/payments\/refund-queue"/);
});
