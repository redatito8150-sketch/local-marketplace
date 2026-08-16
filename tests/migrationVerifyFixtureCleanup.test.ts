import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260816000000_remove_migration_verify_e592656d_test_fixture.sql",
  "utf8"
);

test("cleanup is pinned to the exact inactive migration fixture", () => {
  assert.match(migration, /ce602adc-cb4b-41ef-abf0-efbc0e298c47/);
  assert.match(migration, /migration-verify-e592656d/);
  assert.match(migration, /migration-verify-product-e592656d/);
  assert.match(migration, /E59265-000001/);
  assert.match(migration, /\[TEST DATA - DO NOT USE\] Migration Verify/);
  assert.match(migration, /b\.is_active = false/);
});

test("cleanup aborts for customer history or unexpected inventory movements", () => {
  assert.match(migration, /public\.orders/);
  assert.match(migration, /public\.order_items/);
  assert.match(migration, /public\.reviews/);
  assert.match(migration, /Refusing to remove migration fixture because customer history exists/);
  assert.match(migration, /<> 2/);
  assert.match(migration, /Unexpected inventory movement found for migration fixture/);
});

test("cleanup queues media and restores inventory immutability", () => {
  const queueAt = migration.indexOf("insert into public.storage_cleanup_jobs");
  const productDeleteAt = migration.indexOf("delete from public.products");
  assert.ok(queueAt >= 0 && queueAt < productDeleteAt);
  assert.match(migration, /disable trigger inventory_movements_immutable/);
  assert.match(migration, /enable trigger inventory_movements_immutable/);
  assert.doesNotMatch(migration, /delete\s+from\s+auth\.users/i);
});
