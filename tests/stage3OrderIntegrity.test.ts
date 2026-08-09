import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migration = read("supabase/migrations/20260810000005_order_integrity_and_idempotency.sql");

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

test("checkout reservation and result live in one private database transaction", () => {
  const sql = compact(migration);
  assert.ok(sql.includes("createtableifnotexistsprivate.order_idempotency("));
  assert.ok(sql.includes("primarykey(actor_key,idempotency_key)"));
  assert.ok(sql.includes("onconflict(actor_key,idempotency_key)donothing"));
  assert.ok(sql.includes("forupdate;"));
  assert.ok(sql.includes("setresponse=v_result"));
  assert.ok(sql.includes("revokeallonfunctionprivate.place_order"));
});

test("the idempotent order RPC remains service-role only", () => {
  const sql = compact(migration);
  const signature = "public.place_order(text,text,text,text,text,text,uuid,jsonb,uuid,text,text,text,uuid,numeric,numeric)";
  assert.ok(sql.includes(`revokeallonfunction${signature}frompublic,anon,authenticated;`));
  assert.ok(sql.includes(`grantexecuteonfunction${signature}toservice_role;`));
  assert.ok(sql.includes("p_request_hashtext"));
  assert.ok(sql.includes("raiseexception'idempotency_conflict"));
});

test("new financial writes reject negative prices, quantities, totals, and invalid coupon values", () => {
  const sql = compact(migration);
  assert.ok(sql.includes("check(quantity>0)notvalid"));
  assert.ok(sql.includes("check(price>=0)notvalid"));
  assert.ok(sql.includes("subtotal_usd>=0andsubtotal_egp>=0"));
  assert.ok(sql.includes("used_count>=0and(max_usesisnullormax_uses>0)"));
  assert.ok(sql.includes("discount_type<>'percentage'ordiscount_value<=100"));
});

test("cancellation serializes a group, blocks shipped orders, and releases one coupon once", () => {
  const sql = compact(migration);
  assert.ok(sql.includes("pg_catalog.pg_advisory_xact_lock"));
  assert.ok(sql.includes("ifv_status='shipped'thenraiseexception'cannot_cancel_shipped'"));
  assert.ok(sql.includes("ifv_status='fulfilled'thenraiseexception'cannot_cancel_fulfilled'"));
  assert.ok(sql.includes("andsibling.status<>'cancelled'"));
  assert.ok(sql.includes("andreleased_atisnull"));
  assert.ok(sql.includes("setused_count=used_count-1"));
});

test("order transitions are optimistic, allowlisted, and write history atomically", () => {
  const sql = compact(migration);
  assert.ok(sql.includes("whereid=p_order_idforupdate"));
  assert.ok(sql.includes("ifv_current_status<>p_expected_status"));
  assert.ok(sql.includes("invalid_order_transition"));
  assert.ok(sql.includes("v_current_status='shipped'andp_new_status='fulfilled'"));
  assert.ok(sql.includes("insertintopublic.order_status_history"));

  for (const route of [
    "app/api/admin/orders/[id]/route.ts",
    "app/api/brand-portal/orders/[id]/status/route.ts",
  ]) {
    const source = read(route);
    assert.match(source, /\.rpc\("transition_order_status"/);
    assert.doesNotMatch(source, /\.update\(\{\s*status\s*\}\)/);
  }
});

test("checkout rejects bad credentials and enforces availability plus a client idempotency key", () => {
  const route = read("app/api/orders/route.ts");
  const web = read("app/checkout/page.tsx");
  const mobile = read("apps/mobile/app/checkout.tsx");
  const identity = read("lib/supabase/requestUser.ts");

  assert.match(route, /parseOrderIdempotencyKey/);
  assert.match(route, /identity\.status === "invalid_credentials"/);
  assert.match(route, /!isPublishDateLive\(product\.publish_date\)/);
  assert.match(route, /!brand\?\.is_active/);
  assert.match(web, /"Idempotency-Key": idempotencyKey/);
  assert.match(mobile, /"Idempotency-Key": idempotencyKey/);
  assert.match(identity, /status: "invalid_credentials"/);
  assert.doesNotMatch(read("lib/orders/idempotency.ts"), /new Map/);
});
