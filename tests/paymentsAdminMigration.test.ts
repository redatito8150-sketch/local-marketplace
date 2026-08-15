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

test("Commerce workspace links the payments index alongside the refund-review queue", () => {
  const sidebar = read("components/admin/AdminSidebar.tsx");
  const workspaceNav = read("components/admin/AdminWorkspaceNav.tsx");
  assert.match(sidebar, /activePaths: \["\/admin\/orders", "\/admin\/payments"\]/);
  assert.match(workspaceNav, /label: "Payments", href: "\/admin\/payments", permission: "manage_orders"/);
  assert.match(workspaceNav, /label: "Refund review", href: "\/admin\/payments\/refund-queue", permission: "manage_orders"/);
});
