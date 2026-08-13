import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/20260814000011_brand_portal_order_payment_collection.sql", import.meta.url);

test("COD delivery records payment collection atomically with an auditable actor and source", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /payment_collected_at\s*=\s*case[\s\S]*p_new_status = 'fulfilled'[\s\S]*now\(\)/i);
  assert.match(sql, /payment_collected_by\s*=\s*case[\s\S]*p_actor_id/i);
  assert.match(sql, /payment_collection_source\s*=\s*case[\s\S]*'delivery_confirmation'/i);
  assert.match(sql, /payment_status\s*=\s*case[\s\S]*cash_on_delivery[\s\S]*'paid'/i);
});

test("the collection RPC remains service-role only", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /revoke all on function public\.transition_order_status[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.transition_order_status[\s\S]*to service_role/i);
});
