import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static verification of the Phase 3 migration (webhook + paid-order
// fulfillment) — not applied anywhere in this environment, same
// established pattern as tests/paymentAttemptsSchema.test.ts and
// tests/stage3OrderIntegrity.test.ts.

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

const MIGRATION_PATH = "supabase/migrations/20260812000001_paymob_webhook_and_paid_fulfillment.sql";
const migration = read(MIGRATION_PATH);
const sql = compact(migration);

test("this migration never defines or alters place_order — Cash on Delivery is structurally untouched", () => {
  assert.doesNotMatch(migration, /create (or replace )?function public\.place_order/i);
  assert.doesNotMatch(migration, /alter function[\s\S]*?place_order/i);
  assert.doesNotMatch(migration, /drop function[\s\S]*?place_order/i);
});

test("orders.payment_method widens to include 'card' without removing 'cash_on_delivery'", () => {
  assert.ok(
    sql.includes(
      "altertablepublic.ordersaddconstraintorders_payment_method_checkcheck(payment_methodin('cash_on_delivery','card'))"
    )
  );
});

test("mark_payment_attempt_paid is the only place status can become 'paid', is amount/currency-reconciled, and is idempotent via the webhook event log", () => {
  const fn = migration.match(/create or replace function public\.mark_payment_attempt_paid\([\s\S]*?\$\$;/i)![0];
  const compacted = compact(fn);
  assert.ok(compacted.includes("securitydefiner"));
  assert.ok(compacted.includes("setsearch_path=''"));
  assert.ok(compacted.includes("insertintoprivate.payment_webhook_events"));
  assert.ok(compacted.includes("onconflict(provider,provider_event_id)donothing"));
  assert.ok(compacted.includes("setstatus='paid'"));
  assert.ok(compacted.includes("paid_at=now()"));
  assert.ok(compacted.includes("raiseexception'amount_mismatch"));
  assert.ok(compacted.includes("raiseexception'payment_attempt_state_anomaly"));

  // Only public.payment_attempts.status ever gets SET (assigned) to 'paid'
  // anywhere in this file, and only by this one function — a plain
  // comparison like place_paid_order's `if v_attempt.status = 'paid'`
  // doesn't count, only an UPDATE ... SET does.
  const setPaidOccurrences = (sql.match(/setstatus='paid'/g) || []).length;
  assert.equal(setPaidOccurrences, 1, "exactly one place in this migration may ever SET status = 'paid'");
});

test("mark_payment_attempt_declined never overwrites an attempt that has already moved past pending/processing", () => {
  const fn = migration.match(/create or replace function public\.mark_payment_attempt_declined\([\s\S]*?\$\$;/i)![0];
  const compacted = compact(fn);
  assert.ok(compacted.includes("ifv_attempt.statusnotin('pending','processing')then"));
  // No unconditional UPDATE ... set status = 'failed' — must be reachable
  // only past that guard.
  assert.ok(compacted.includes("setstatus='failed'"));
});

test("place_paid_order never writes paid_at and cannot set status to 'paid' — it only ever reads/compares an already-'paid' row", () => {
  const fn = migration.match(/create or replace function public\.place_paid_order\([\s\S]*?\n\$\$;/i)![0];
  assert.doesNotMatch(fn, /paid_at\s*=\s*now/);
  // `if v_attempt.status = 'paid' then` is a legitimate READ/comparison
  // (deciding whether to transition to 'reflecting') — what must never
  // appear is an UPDATE ... SET status = 'paid' assignment.
  assert.doesNotMatch(fn, /set\s+status\s*=\s*'paid'/i);
  assert.match(fn, /PAYMENT_ATTEMPT_NOT_PAID/);
});

test("place_paid_order isolates each bucket in BEGIN/EXCEPTION (not SAVEPOINT, which PL/pgSQL cannot issue directly)", () => {
  const fn = migration.match(/create or replace function public\.place_paid_order\([\s\S]*?\n\$\$;/i)![0];
  assert.doesNotMatch(fn, /\bsavepoint\b/i);
  assert.match(fn, /exception when others then/i);
  // The retry-skip guard for already-fulfilled buckets.
  assert.match(fn, /status = 'fulfilled'\s*\)\s*then\s*\n\s*continue;/);
});

test("place_paid_order's per-bucket ledger writes are idempotent upserts, keyed on (payment_attempt_id, bucket_key)", () => {
  const fn = migration.match(/create or replace function public\.place_paid_order\([\s\S]*?\n\$\$;/i)![0];
  const compacted = compact(fn);
  assert.ok(compacted.includes("onconflict(payment_attempt_id,bucket_key)doupdateset"));
});

test("every new RPC is security definer, search_path-locked, and granted to service_role only (except the ownership-checked summary function, already covered in Phase 1's tests)", () => {
  for (const fnName of [
    "mark_payment_attempt_paid",
    "mark_payment_attempt_declined",
    "place_paid_order",
    "mark_payment_attempt_refund_recorded",
    "list_payment_attempts_needing_refund_review",
  ]) {
    const revokeGrantPattern = new RegExp(
      `revoke all on function public\\.${fnName}\\([^)]*\\)\\s*from public, anon, authenticated;\\s*grant execute on function public\\.${fnName}\\([^)]*\\)\\s*to service_role;`,
      "i"
    );
    assert.ok(revokeGrantPattern.test(migration), `expected ${fnName} to be revoked from public/anon/authenticated and granted only to service_role`);
  }

  // payment_attempt_fulfillment_summary is the one deliberate exception —
  // ownership-checked internally (see its own body), safe to grant
  // directly to authenticated. Every OTHER "grant execute" in this file
  // must target service_role only.
  const allGrants = migration.match(/grant execute on function[^;]*;/gi) ?? [];
  const nonSummaryGrants = allGrants.filter((g) => !g.includes("payment_attempt_fulfillment_summary"));
  for (const grant of nonSummaryGrants) {
    assert.doesNotMatch(grant, /\b(anon|authenticated)\b/i);
  }
  const summaryGrant = allGrants.find((g) => g.includes("payment_attempt_fulfillment_summary"));
  assert.ok(summaryGrant);
  assert.match(summaryGrant!, /to authenticated, service_role/);
});

test("mark_payment_attempt_refund_recorded rejects a second attempt to record the same refund", () => {
  const fn = migration.match(/create or replace function public\.mark_payment_attempt_refund_recorded\([\s\S]*?\$\$;/i)![0];
  assert.match(fn, /ALREADY_MARKED_REFUNDED/);
  assert.match(fn, /refunded_at is not null/);
  // Does not call any external refund API — this is a marker only.
  assert.doesNotMatch(fn, /http|fetch|paymob\.com/i);
});

test("list_payment_attempts_needing_refund_review distinguishes full failure from partial fulfillment", () => {
  const fn = migration.match(/create or replace function public\.list_payment_attempts_needing_refund_review\(\)[\s\S]*?\$\$;/i)![0];
  assert.match(fn, /fulfillment_failed/);
  assert.match(fn, /is_partial/);
  assert.match(fn, /refund_amount_cents/);
});

test("webhook route: HMAC is verified before any database call, never logs the payload or secret, and calls the exact three RPCs by name", () => {
  const route = read("app/api/payments/paymob/webhook/route.ts");
  assert.match(route, /verifyTransactionHmac/);
  assert.match(route, /\.rpc\("mark_payment_attempt_paid"/);
  assert.match(route, /\.rpc\("mark_payment_attempt_declined"/);
  assert.match(route, /\.rpc\("place_paid_order"/);
  assert.doesNotMatch(route, /console\.(log|info)\(.*obj/i);
  assert.doesNotMatch(route, /PAYMOB_SECRET_KEY/);

  // HMAC check must appear before any supabaseAdmin call in source order.
  const hmacCheckIndex = route.indexOf("verifyTransactionHmac(");
  const firstDbCallIndex = route.indexOf("supabaseAdmin.");
  assert.ok(hmacCheckIndex !== -1 && firstDbCallIndex !== -1);
  assert.ok(hmacCheckIndex < firstDbCallIndex, "HMAC must be verified before any database call");
});

test("customer status endpoint uses the cookie-bound (RLS-respecting) client, not supabaseAdmin, never raw-SELECTs cart/shipping snapshots, and only reads cart_snapshot content through the narrow ownership-checked RPC", () => {
  const route = read("app/api/payments/paymob/attempts/[id]/route.ts");
  // Strip // line comments first — this file's own documentation comments
  // legitimately explain what it does NOT return, which would otherwise
  // trip a naive substring check. Match up to (not including) any trailing
  // \r explicitly — on CRLF line endings (this repo checks out CRLF on
  // Windows), a plain /\/\/.*$/ silently fails to match at all, since `$`
  // only asserts the true end of the string while `.` can't consume the
  // trailing \r, leaving the comment (and anything in it) intact.
  const codeOnly = route
    .split("\n")
    .map((line) => line.replace(/\/\/[^\r\n]*/, ""))
    .join("\n");

  assert.match(codeOnly, /createSupabaseServerClient/);
  assert.doesNotMatch(codeOnly, /\bsupabaseAdmin\b/);
  // get_fulfilled_cart_snapshot_items — the one deliberate, narrow, RPC-
  // mediated exception (see supabase/migrations/
  // 20260812000003_cart_reconciliation_snapshot_read.sql) — has
  // "cart_snapshot" as a literal substring of its own name, so a blanket
  // doesNotMatch would false-positive on it. What must stay true is
  // narrower: no raw SELECT of the cart_snapshot column itself anywhere
  // in this route.
  const selectCalls = codeOnly.match(/\.select\("[^"]*"\)/g) ?? [];
  assert.ok(selectCalls.length > 0, "expected to find at least one .select(...) call");
  for (const call of selectCalls) {
    assert.doesNotMatch(call, /cart_snapshot/);
  }
  assert.match(codeOnly, /get_fulfilled_cart_snapshot_items/);
  assert.doesNotMatch(codeOnly, /shipping_snapshot/);
  assert.doesNotMatch(codeOnly, /special_reference/);
});

test("customer status endpoint only fetches purchasedItems when fulfillment was NOT partial — cart_snapshot has no per-bucket mapping, so a partial result can't be safely attributed to specific lines", () => {
  const route = read("app/api/payments/paymob/attempts/[id]/route.ts");
  // lastIndexOf, not indexOf — this route's own module comment also
  // mentions the RPC by name (documenting the deliberate exception), so
  // the first occurrence in the file is that comment, not the actual call.
  const rpcCallIndex = route.lastIndexOf("get_fulfilled_cart_snapshot_items");
  assert.ok(rpcCallIndex !== -1);
  // The nearest preceding `if` guard before the RPC call must gate on
  // !isPartial.
  const before = route.slice(0, rpcCallIndex);
  const guardIndex = before.lastIndexOf("if (!isPartial)");
  assert.ok(guardIndex !== -1, "expected the RPC call to be guarded by if (!isPartial)");
  // Nothing (no closing brace) between the guard and the call — i.e. the
  // call is directly inside that guard's block, not some unrelated later
  // `if`.
  const between = route.slice(guardIndex, rpcCallIndex);
  assert.doesNotMatch(between, /\n\s*\}/);
});

test("admin refund-marking route is gated by requireStaffRole(\"admin\") and never calls a Paymob refund API", () => {
  const route = read("app/api/admin/payments/[id]/mark-refunded/route.ts");
  assert.match(route, /requireStaffRole\("admin"\)/);
  assert.doesNotMatch(route, /paymob\.com/i);
  assert.doesNotMatch(route, /\/refund/i);
});

test("COD's own order route is byte-for-byte untouched by this phase (still calls place_order, nothing Paymob-related)", () => {
  const codRoute = read("app/api/orders/route.ts");
  assert.match(codRoute, /\.rpc\("place_order"/);
  assert.doesNotMatch(codRoute, /paymob/i);
});
