import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static verification of the Master Order Phase 1 migration — promoting
// orders.order_group_id (a bare, un-FK'd repeated UUID) into a real
// public.master_orders parent row. Same established pattern as
// tests/stage3OrderIntegrity.test.ts / tests/paymobWebhookSchema.test.ts.

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

const MIGRATION_PATH = "supabase/migrations/20260812000006_master_orders.sql";
const migration = read(MIGRATION_PATH);
const sql = compact(migration);

test("master_orders table exists with a unique customer-facing number, no status/aggregate columns, and RLS scoped to the owner", () => {
  assert.ok(sql.includes("createtablepublic.master_orders"));
  assert.ok(sql.includes("master_order_numbertextnotnullunique"));
  assert.ok(sql.includes("idispublic.master_ordersenablerowlevelsecurity") || sql.includes("altertablepublic.master_ordersenablerowlevelsecurity"));
  assert.ok(sql.includes("using(user_id=auth.uid())"));
  // Deliberately no stored status/aggregate — see the migration's own
  // header comment on why (an open pending business decision). Bounded to
  // just the CREATE TABLE statement itself, not the whole file (which
  // legitimately uses "status" everywhere else, e.g. payment_status).
  const tableDef = migration.match(/create table public\.master_orders \([\s\S]*?\);/i)![0];
  assert.doesNotMatch(tableDef, /status/i);
});

test("the backfill creates exactly one master_orders row per distinct pre-existing order_group_id, reusing that value as the new row's id", () => {
  assert.match(migration, /group by order_group_id/i);
  assert.match(migration, /insert into public\.master_orders \(id, master_order_number, user_id, created_at\)/i);
  // Reuses the group's own value as id — no separate remapping table/join
  // needed anywhere downstream.
  assert.match(migration, /values \(v_group\.order_group_id, v_number, v_group\.user_id, v_group\.created_at\)/i);
});

test("orders.order_group_id is FK'd to master_orders and renamed to master_order_id", () => {
  assert.ok(sql.includes("altertablepublic.ordersaddconstraintorders_master_order_id_fkeyforeignkey(order_group_id)referencespublic.master_orders(id)"));
  assert.ok(sql.includes("altertablepublic.ordersrenamecolumnorder_group_idtomaster_order_id"));
});

test("payment_attempts.order_group_id is renamed and gets a real FK (it previously had none, by design, since there was no single-row parent to reference)", () => {
  assert.ok(sql.includes("altertablepublic.payment_attemptsrenamecolumnorder_group_idtomaster_order_id"));
  assert.ok(sql.includes("foreignkey(master_order_id)referencespublic.master_orders(id)"));
});

test("private.place_order creates a master_orders row (not a bare gen_random_uuid()) for the group id, and no longer defaults v_group_id at declare time", () => {
  const fn = migration.match(/create or replace function private\.place_order\([\s\S]*?\n\$\$;/i)![0];
  assert.doesNotMatch(fn, /v_group_id uuid := gen_random_uuid\(\)/);
  assert.match(fn, /v_group_id uuid;/);
  assert.match(fn, /insert into master_orders \(master_order_number, user_id\)/);
  assert.match(fn, /returning id into v_group_id;/);
  // Returned result carries both the id and the human-readable number.
  assert.match(fn, /'master_order_id', v_group_id/);
  assert.match(fn, /'master_order_number', v_master_order_number/);
});

test("public.place_order's wrapper reads master_order_id (not order_group_id) from the private function's result for coupon_redemptions bookkeeping", () => {
  const fn = migration.match(/create or replace function public\.place_order\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /v_group_id := \(v_result ->> 'master_order_id'\)::uuid;/);
  assert.match(fn, /insert into private\.coupon_redemptions \(master_order_id, coupon_code\)/);
});

test("public.cancel_order reads/writes the renamed master_order_id column throughout, including the per-group advisory lock and coupon-release sibling check", () => {
  const fn = migration.match(/create or replace function public\.cancel_order\(p_order_id uuid\)[\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /select master_order_id into v_group_id/);
  assert.match(fn, /pg_advisory_xact_lock\(\s*\n?\s*pg_catalog\.hashtextextended\(v_group_id::text, 0\)/);
  assert.match(fn, /sibling\.master_order_id = v_group_id/);
  assert.match(fn, /where master_order_id = v_group_id\s*\n\s*and released_at is null/);
  assert.doesNotMatch(fn, /order_group_id/);
});

test("place_paid_order creates the master order once, outside any bucket's own exception-catching block, and reuses it on retry", () => {
  const fn = migration.match(/create or replace function public\.place_paid_order\([\s\S]*?\n\$\$;/i)![0];

  // Reuse-on-retry: no longer coalesces with gen_random_uuid() — reads the
  // attempt's own master_order_id (null on a fresh attempt, already-set on
  // a retry of an interrupted prior run).
  assert.doesNotMatch(fn, /coalesce\(v_attempt\.order_group_id, gen_random_uuid\(\)\)/);
  assert.match(fn, /v_group_id := v_attempt\.master_order_id;/);

  // The master_orders insert must appear BEFORE Pass 2's bucket loop
  // starts (textually earlier), never inside a bucket's begin/exception
  // block — see the migration's own comment on why (a bucket rollback
  // would silently invalidate v_group_id while it still points at a
  // rolled-back row).
  const createIndex = fn.indexOf("insert into public.master_orders");
  const pass2Index = fn.indexOf("-- Pass 2:");
  assert.ok(createIndex !== -1 && pass2Index !== -1);
  assert.ok(createIndex < pass2Index, "master_orders must be created before Pass 2's bucket loop begins");

  // And it must be guarded so a fully-already-fulfilled retry (which the
  // top-of-function status check short-circuits before reaching here
  // anyway) or an attempt with nothing left to try never creates one.
  const between = fn.slice(0, createIndex);
  assert.match(between, /if v_group_id is null and exists \(/);

  // order_items.image bugfix from 20260812000005 must survive this rewrite.
  assert.match(fn, /coalesce\(v_item ->> 'image', ''\)/);
});

test("place_paid_order's final status update writes master_order_id, and the returned jsonb no longer uses the old key", () => {
  const fn = migration.match(/create or replace function public\.place_paid_order\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /set status = 'fulfilled', master_order_id = v_group_id/);
  assert.match(fn, /'master_order_id', case when v_any_fulfilled then v_group_id else null end/);
  assert.doesNotMatch(fn, /'order_group_id'/);
});

test("cancel_order_group drops the p_user_id ownership parameter/filter (admin-only now, authorization moved to the calling route) and stays service_role-only", () => {
  const fn = migration.match(/create or replace function public\.cancel_order_group\(p_master_order_id uuid\)[\s\S]*?\n\$\$;/i)![0];
  assert.doesNotMatch(fn, /p_user_id/);
  assert.match(fn, /where master_order_id = p_master_order_id for update/);
  // Still loops every sibling and reports cancelled vs skipped rather than
  // aborting the whole batch on one already-progressed shipment.
  assert.match(fn, /cancelled_order_ids/);
  assert.match(fn, /skipped_order_ids/);

  assert.match(
    migration,
    /revoke all on function public\.cancel_order_group\(uuid\) from public, anon, authenticated;\s*\n\s*grant execute on function public\.cancel_order_group\(uuid\) to service_role;/
  );
});

test("the new admin cancel-whole-purchase route is requireAdminUser()-gated and calls cancel_order_group by the new single-param signature", () => {
  const route = read("app/api/admin/master-orders/[id]/cancel/route.ts");
  assert.match(route, /requireAdminUser\(\)/);
  assert.match(route, /\.rpc\("cancel_order_group", \{\s*\n\s*p_master_order_id: params\.id,/);
});

test("OrderRecord carries masterOrderId and masterOrderNumber (not orderGroupId)", () => {
  const types = read("types/index.ts");
  const recordMatch = types.match(/export interface OrderRecord \{[\s\S]*?\n\}/);
  assert.ok(recordMatch);
  assert.match(recordMatch![0], /masterOrderId: string;/);
  assert.match(recordMatch![0], /masterOrderNumber: string;/);
  assert.doesNotMatch(recordMatch![0], /orderGroupId/);
});

test("both order data mappers (customer + admin) join master_orders(master_order_number) and map master_order_id, and getSiblingOrders filters by master_order_id", () => {
  const customerData = read("lib/data/orders.ts");
  assert.match(customerData, /master_orders\(master_order_number\)/);
  assert.match(customerData, /masterOrderId: row\.master_order_id/);

  const adminData = read("lib/data/admin.ts");
  assert.match(adminData, /master_orders\(master_order_number\)/);
  assert.match(adminData, /masterOrderId: row\.master_order_id/);
  assert.match(adminData, /\.eq\("master_order_id", masterOrderId\)/);
});

test("the customer account order grouping and the admin order list search both key off masterOrderId/masterOrderNumber", () => {
  const ordersTabs = read("components/account/OrdersTabs.tsx");
  assert.match(ordersTabs, /order\.masterOrderId/);
  assert.doesNotMatch(ordersTabs, /orderGroupId/);

  const adminOrdersPage = read("app/admin/orders/page.tsx");
  const adminOrderFilters = read("lib/orders/adminOrderFilters.ts");
  assert.match(adminOrdersPage, /groupAdminOrders\(allOrders\)/);
  assert.match(adminOrderFilters, /masterOrderId \|\| order\.id/);
  assert.match(adminOrderFilters, /masterOrderNumber \|\| order\.orderNumber/);
});
