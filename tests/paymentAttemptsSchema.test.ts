import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This migration is NOT applied anywhere (no local Supabase/Docker
// available in this environment — see the Phase 1 report). These tests
// verify the SQL's structure/security properties statically, the same
// established pattern tests/stage3OrderIntegrity.test.ts already uses for
// migrations no live test database can exercise: read the file, strip
// comments/whitespace, assert the compacted text contains the exact
// clauses that make the design's safety guarantees true. This is not a
// substitute for a real RLS/concurrency test against a live database —
// see tests/security.rls.test.ts for that pattern once this migration is
// actually applied to a project.

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

const MIGRATION_PATH = "supabase/migrations/20260811000001_payment_attempts.sql";
const migration = read(MIGRATION_PATH);
const sql = compact(migration);

test("payment_attempts is created with the approved lifecycle, currency, and amount constraints", () => {
  assert.ok(sql.includes("createtableifnotexistspublic.payment_attempts("));
  assert.ok(
    sql.includes(
      "statustextnotnulldefault'created'check(statusin('created','pending','processing','paid','reflecting','fulfilled','fulfillment_failed','failed','expired','cancelled'))"
    )
  );
  assert.ok(sql.includes("amount_centsintegernotnullcheck(amount_cents>0)"));
  assert.ok(sql.includes("currencytextnotnulldefault'egp'check(currency='egp')"));
  assert.ok(sql.includes("idempotency_actortextnotnullcheck(idempotency_actor~'^user:')"));
  assert.ok(sql.includes("request_hashtextnotnullcheck(request_hash~'^[0-9a-f]{64}$')"));
  assert.ok(sql.includes("special_referencetextnotnullunique"));
  assert.ok(sql.includes("user_iduuidnotnullreferencesauth.users(id)ondeletecascade"));
});

test("provider_client_secret is never a column — Rev. 2's reversed decision is preserved", () => {
  // Checked against the COMPACTED text (comments stripped) — the raw
  // migration legitimately mentions provider_client_secret once, in a
  // comment explaining why it's deliberately absent as a column.
  assert.ok(!sql.includes("provider_client_secret"));
  assert.ok(!sql.includes("client_secrettext"));
});

test("payment_attempts has the exact unique indexes the approved architecture requires", () => {
  assert.ok(
    sql.includes(
      "createuniqueindexifnotexistspayment_attempts_actor_request_idxonpublic.payment_attempts(idempotency_actor,client_request_id)"
    )
  );
  assert.ok(
    sql.includes(
      "createuniqueindexifnotexistspayment_attempts_provider_intention_idxonpublic.payment_attempts(provider,provider_intention_id)whereprovider_intention_idisnotnull"
    )
  );
});

test("payment_attempts RLS: broad access revoked, only an owner-scoped safe-column SELECT is granted", () => {
  assert.ok(sql.includes("altertablepublic.payment_attemptsenablerowlevelsecurity"));
  assert.ok(sql.includes("revokeallonpublic.payment_attemptsfromanon,authenticated"));
  assert.ok(sql.includes("createpolicy\"customerscanreadtheirownpaymentattempts\""));
  assert.ok(sql.includes("using(user_id=(selectauth.uid()))"));

  const grantMatch = migration.match(/grant select \(([\s\S]*?)\) on public\.payment_attempts to authenticated;/i);
  assert.ok(grantMatch, "expected exactly one column-scoped grant on public.payment_attempts");
  const grantedColumns = grantMatch![1].toLowerCase();

  for (const safeColumn of [
    "id",
    "status",
    "amount_cents",
    "currency",
    "created_at",
    "updated_at",
    "paid_at",
    "processed_at",
    "expires_at",
    "order_group_id",
    "failure_reason",
  ]) {
    assert.ok(grantedColumns.includes(safeColumn), `expected ${safeColumn} to be customer-readable`);
  }

  for (const forbiddenColumn of [
    "cart_snapshot",
    "shipping_snapshot",
    "coupon_snapshot",
    "request_hash",
    "idempotency_actor",
    "client_request_id",
    "special_reference",
    "provider_intention_id",
    "provider_order_id",
    "provider_transaction_id",
  ]) {
    assert.ok(!grantedColumns.includes(forbiddenColumn), `expected ${forbiddenColumn} to NOT be customer-readable`);
  }

  // No insert/update/delete grant to anon/authenticated exists anywhere in
  // this migration — every write is a service_role-only RPC.
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete)[\s\S]*?to\s+(anon|authenticated)/i);
});

test("private.payment_attempt_fulfillments exists with its idempotency-guaranteeing unique constraint and zero customer access", () => {
  assert.ok(sql.includes("createtableifnotexistsprivate.payment_attempt_fulfillments("));
  assert.ok(sql.includes("unique(payment_attempt_id,bucket_key)"));
  assert.ok(
    sql.includes("revokeallonprivate.payment_attempt_fulfillmentsfrompublic,anon,authenticated")
  );
  assert.ok(sql.includes("payment_attempt_iduuidnotnullreferencespublic.payment_attempts(id)ondeletecascade"));
  assert.ok(sql.includes("expected_amount_centsintegernotnullcheck(expected_amount_cents>=0)"));

  // No RLS policy is defined for this table at all — schema-level lockout
  // (the `private` schema's own "revoke all" already covers it) is the
  // whole point, per the approved architecture's §4. A real policy on this
  // table would read "on private.payment_attempt_fulfillments for ..." —
  // check for that specific shape rather than any mention of the table
  // name (which legitimately appears in nearby comments).
  assert.doesNotMatch(migration, /on\s+private\.payment_attempt_fulfillments\s+for/i);
  assert.ok(!sql.includes("altertableprivate.payment_attempt_fulfillmentsenablerowlevelsecurity"));
});

test("Phase 1 does not define place_paid_order, the webhook event log, or place_order — mentioning them in comments as future work is fine", () => {
  assert.doesNotMatch(migration, /create (or replace )?function public\.place_paid_order/i);
  assert.doesNotMatch(migration, /create table if not exists (public|private)\.payment_webhook_events/i);
  assert.doesNotMatch(migration, /create (or replace )?function public\.place_order/i);
  assert.doesNotMatch(migration, /alter function[\s\S]*?place_order/i);
});

test("every payment_attempts-related RPC is security definer, search_path-locked, and service_role-only", () => {
  for (const fn of [
    "create_payment_attempt",
    "mark_paymob_intention_created",
    "mark_paymob_intention_failed",
  ]) {
    const definitionMatch = migration.match(
      new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?\\$\\$;`, "i")
    );
    assert.ok(definitionMatch, `expected to find public.${fn}`);
    const definition = compact(definitionMatch![0]);
    assert.ok(definition.includes("securitydefiner"), `${fn} must be security definer`);
    assert.ok(definition.includes("setsearch_path=''"), `${fn} must lock search_path`);

    const revokeGrantMatch = migration.match(
      new RegExp(
        `revoke all on function public\\.${fn}\\([^)]*\\)\\s*from public, anon, authenticated;\\s*grant execute on function public\\.${fn}\\([^)]*\\)\\s*to service_role;`,
        "i"
      )
    );
    assert.ok(revokeGrantMatch, `expected ${fn} to be revoked from public/anon/authenticated and granted only to service_role`);
  }

  // Never granted directly to anon/authenticated — the only path to these
  // functions is the service_role-backed API route.
  assert.doesNotMatch(migration, /grant execute[\s\S]*?to\s+(anon|authenticated)\b/i);
});

test("create_payment_attempt enforces idempotency at the database level (unique index + IDEMPOTENCY_CONFLICT), not just in application code", () => {
  assert.ok(sql.includes("exceptionwhenunique_violationthen"));
  assert.ok(sql.includes("raiseexception'idempotency_conflict"));
  assert.ok(sql.includes("'replayed',true"));
  assert.ok(sql.includes("'replayed',false"));
  // special_reference is derived from the row's own id, not an arbitrary
  // value — the approved architecture's §13.
  assert.ok(sql.includes("v_special_reference:='mahaly_'||v_id::text"));
});

test("mark_paymob_intention_created / mark_paymob_intention_failed are compare-and-swap on status = 'created'", () => {
  const createdFn = migration.match(/create or replace function public\.mark_paymob_intention_created\([\s\S]*?\$\$;/i)![0];
  const failedFn = migration.match(/create or replace function public\.mark_paymob_intention_failed\([\s\S]*?\$\$;/i)![0];

  for (const fn of [createdFn, failedFn]) {
    const compacted = compact(fn);
    assert.ok(compacted.includes("andstatus='created'"));
    assert.ok(compacted.includes("payment_attempt_status_conflict"));
  }
});

test("app route wires the three Phase 1 RPCs by exact name", () => {
  const route = read("app/api/payments/paymob/intention/route.ts");
  assert.match(route, /\.rpc\("create_payment_attempt"/);
  assert.match(route, /\.rpc\("mark_paymob_intention_created"/);
  assert.match(route, /\.rpc\("mark_paymob_intention_failed"/);
  assert.match(route, /idempotency-key/i);
});

test("Create Intention never creates an order and never touches the COD path", () => {
  const orchestrator = read("lib/payments/createIntentionForCart.ts");
  assert.doesNotMatch(orchestrator, /place_order/i);
  assert.doesNotMatch(orchestrator, /place_paid_order/i);
  assert.doesNotMatch(orchestrator, /from\(\s*["']orders["']\s*\)/i);
  assert.doesNotMatch(orchestrator, /provider_client_secret/i);

  // COD's own route is untouched by this phase — it must still call the
  // original place_order RPC exactly as before.
  const codRoute = read("app/api/orders/route.ts");
  assert.match(codRoute, /\.rpc\("place_order"/);
});
