import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260821090000_brand_stock_transition_only_invariant.sql",
  "utf8"
);
const returnRoute = readFileSync("app/api/brand-portal/warehouse/returns/route.ts", "utf8");
const receiveRoute = readFileSync("app/api/admin/warehouse/transfers/[id]/receive/route.ts", "utf8");
const manualStockRoute = readFileSync("app/api/brand-portal/warehouse/stock/route.ts", "utf8");

test("brand stock is normalized to zero outside an open fulfillment transition", () => {
  const guard = migration.match(/create or replace function private\.enforce_transition_only_brand_stock\(\)[\s\S]*?\n\$\$;/i)![0];
  assert.match(guard, /status not in \('completed', 'cancelled', 'failed'\)/);
  assert.match(guard, /if not coalesce\(v_has_open_transition, false\) then/);
  assert.match(guard, /new\.brand_stock_quantity := 0;/);
  assert.match(migration, /before update of brand_stock_quantity on public\.product_variants/);
});

test("the one-time repair preserves active cutover snapshots and clears only non-transition balances", () => {
  assert.match(migration, /update public\.product_variants pv[\s\S]*?pv\.brand_stock_quantity > 0/);
  assert.match(migration, /and not exists \([\s\S]*?from public\.brand_fulfillment_transitions bft[\s\S]*?status not in \('completed', 'cancelled', 'failed'\)/);
});

test("every suppressed or cleaned balance is preserved in an immutable reconciliation ledger", () => {
  assert.match(migration, /create table if not exists public\.brand_stock_reconciliation_events/);
  assert.match(migration, /previous_quantity integer not null/);
  assert.match(migration, /attempted_quantity integer not null/);
  assert.match(migration, /new_quantity integer not null/);
  assert.match(migration, /before update or delete on public\.brand_stock_reconciliation_events/);
  assert.match(migration, /Brand stock reconciliation history is immutable/);
});

test("the deprecated manual setter cannot recreate an ordinary brand-stock balance", () => {
  assert.match(migration, /MANUAL_BRAND_STOCK_DISABLED/);
  assert.match(manualStockRoute, /MANUAL_STOCK_OVERWRITE_DISABLED/);
  assert.doesNotMatch(manualStockRoute, /\.rpc\("set_warehouse_brand_stock"/);
});

test("role matrix keeps brand returns owner-only, impersonation read-only, and receiving permission-gated", () => {
  assert.match(returnRoute, /owner\.accessLevel !== "owner"/);
  assert.match(returnRoute, /owner\.isImpersonating/);
  assert.match(receiveRoute, /requireWarehouseReceiver\(\)/);
});

test("ordinary returns retain their canonical warehouse history even when the deprecated balance is suppressed", () => {
  assert.match(returnRoute, /request_warehouse_return/);
  assert.match(receiveRoute, /receive_warehouse_document/);
  assert.match(migration, /warehouse_transfers,\s*\n-- warehouse_transfer_items, and inventory_movements/);
});
