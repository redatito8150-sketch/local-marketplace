import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260820000001_production_audit_corrective_fixes.sql");

// Static verification of the fixes made in response to the 2026-08-20
// production security/correctness/reliability audit
// (docs/audits/2026-08-20-production-security-correctness-reliability-audit-en.md).
// Live-DB behavior (the actual RLS/trigger/RPC effects) is not exercised
// here — none of this migration has been applied to any database, per this
// task's explicit instruction not to. These tests assert the fix is
// present in the source, matching the convention every other
// *RepoSafety.test.ts file in this suite already uses.

test("TEST-01: the three live-DB test suites all require an explicit RUN_LIVE_RLS=1 opt-in, not just credential presence", () => {
  for (const file of ["tests/security.rls.test.ts", "tests/avatarLinking.test.ts", "tests/crossTenantIsolation.test.ts"]) {
    assert.match(read(file), /RUN_LIVE_RLS/, `${file} is missing the RUN_LIVE_RLS opt-in`);
  }
});

test("CI-01: the CI workflow no longer exposes SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY job-wide", () => {
  const ci = read(".github/workflows/ci.yml");
  const verifyJob = ci.slice(ci.indexOf("  verify:"), ci.indexOf("  live-supabase:"));
  assert.doesNotMatch(verifyJob, /^\s*SUPABASE_SERVICE_ROLE_KEY:/m);
  assert.doesNotMatch(verifyJob, /^\s*SUPABASE_URL:/m);
  assert.match(ci, /live-supabase:[\s\S]*RUN_LIVE_RLS: "1"/);
  assert.match(ci, /DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY/);
  // The two NEXT_PUBLIC_* values remain — they are the public anon
  // key/URL, meant to be inlined into the client bundle by the build step.
  assert.match(ci, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(ci, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});

test("AUTH-01: Brand Portal impersonation and the public brand inline-edit route both require manage_brands, not just is_admin", () => {
  const brandAuth = read("lib/supabase/brandAuth.ts");
  assert.match(brandAuth, /if \(!isAdmin\) return null;/);
  assert.match(brandAuth, /permissions\.has\("manage_brands"\)/);
  const inlineEdit = read("app/api/brands/[slug]/inline-edit/route.ts");
  assert.match(inlineEdit, /getUserPermissions\(admin\.id\)/);
  assert.match(inlineEdit, /permissions\.has\("manage_brands"\)/);
});

test("WH-01: the admin warehouse correction route requires transferId for every correction and never calls apply_warehouse_stock_correction directly", () => {
  const route = read("app/api/admin/warehouse/corrections/route.ts");
  assert.match(route, /if \(!body\?\.transferId\)/);
  assert.doesNotMatch(route, /\.rpc\("apply_warehouse_stock_correction"/);
});

test("WH-02: the brand-portal warehouse return-request route is owner-only, matching the forward transfer route", () => {
  const route = read("app/api/brand-portal/warehouse/returns/route.ts");
  assert.match(route, /owner\.accessLevel !== "owner"/);
});

test("WH-03: an inbound (non-return) warehouse receipt is rejected unless it uses the current per-line actual-Variant model", () => {
  const route = read("app/api/admin/warehouse/transfers/[id]/receive/route.ts");
  assert.match(route, /if \(!isReturn && !usesActualReceiptModel\)/);
});

test("PROD-02: Archived products cannot acquire new stock or open a new inbound warehouse request", () => {
  assert.match(migration, /PRODUCT_ARCHIVED_CANNOT_ACQUIRE_STOCK/);
  assert.match(migration, /before update of quantity, brand_stock_quantity on public\.product_variants/);
  assert.match(migration, /before insert on public\.warehouse_transfer_items/);
});

test("DB-01: the deletion-eligibility warehouse-history check also covers receipt and correction Variant references, not just transfer items", () => {
  assert.match(migration, /warehouse_receipt_lines/);
  assert.match(migration, /warehouse_correction_lines/);
  assert.match(migration, /expected_variant_id/);
  assert.match(migration, /wcl\.from_variant_id = pv\.id or wcl\.to_variant_id = pv\.id/);
});

test("DB-04: a live product cannot be pushed back to a pre-live moderation status through a direct write", () => {
  assert.match(migration, /PRODUCT_LIVE_CANNOT_REVERT_TO_PRE_LIVE_STATE/);
  assert.match(migration, /new\.status in \('pending_review', 'changes_requested'\)/);
});

test("APP-01: application deletion is one transactional RPC that also queues Storage cleanup, not five unguarded sequential deletes", () => {
  assert.match(migration, /create or replace function public\.admin_delete_brand_application/);
  assert.match(migration, /insert into public\.storage_cleanup_jobs/);
  const route = read("app/api/admin/applications/[id]/route.ts");
  assert.match(route, /deleteApplicationTransactionally/);
  assert.doesNotMatch(route, /for \(const table of childTables\)/);
});

test("PAY-02: payment_attempts.user_id survives account deletion (ON DELETE SET NULL, nullable column)", () => {
  assert.match(migration, /alter table public\.payment_attempts alter column user_id drop not null;/);
  assert.match(migration, /foreign key \(user_id\) references auth\.users\(id\) on delete set null;/);
  // The "refuses to proceed while a payment attempt is in flight" half of
  // this finding was superseded by corrective pass 2, Section 3 (atomic
  // deletion-vs-payment-creation via a shared row lock, not a standalone
  // SELECT) — see productionAuditCorrectivePass2RepoSafety.test.ts.
});

test("PAY-03: cancel_order rejects a captured, un-refunded card order for every caller (Admin, Brand, and the customer path it already had)", () => {
  const fn = migration.slice(migration.indexOf("create or replace function public.cancel_order(p_order_id uuid)"));
  assert.match(fn, /v_payment_method <> 'cash_on_delivery' and v_payment_status = 'paid'/);
  assert.match(fn, /PAID_ORDER_REQUIRES_REFUND_REVIEW/);
  assert.match(read("app/api/admin/orders/[id]/route.ts"), /PAID_ORDER_REQUIRES_REFUND_REVIEW/);
  assert.match(read("app/api/brand-portal/orders/[id]/cancel/route.ts"), /PAID_ORDER_REQUIRES_REFUND_REVIEW/);
});

// PAY-09 (part 1) as originally implemented here — mark_payment_attempt_
// refund_recorded blanket-setting EVERY sibling order under one
// master_order_id to 'refunded' — was exactly the "do not mark every order
// under the same master_order_id as fully refunded" defect corrective pass
// 2 was rejected over. That function is dropped by the corrective-pass-2
// migration; its replacement (record_order_refund, scoped to one specific
// order with an exact amount) is covered in
// productionAuditCorrectivePass2RepoSafety.test.ts.
test("PAY-09 (superseded): mark_payment_attempt_refund_recorded is dropped by the corrective-pass-2 migration, not left alongside its replacement", () => {
  const pass2Migration = read("supabase/migrations/20260821000000_production_audit_corrective_pass_2.sql");
  assert.match(pass2Migration, /drop function if exists public\.mark_payment_attempt_refund_recorded\(uuid, uuid, text\);/);
});

test("PAY-06: coupon usage is reserved atomically at payment-attempt creation via an additive, self-expiring reservation ledger", () => {
  assert.match(migration, /create table if not exists private\.coupon_reservations/);
  assert.match(migration, /unique \(payment_attempt_id\)/);
  const fn = migration.slice(migration.indexOf("create or replace function public.create_payment_attempt"));
  assert.match(fn, /v_coupon\.used_count \+ v_active_reservations >= v_coupon\.max_uses/);
  assert.match(fn, /COUPON_LIMIT_REACHED/);
  assert.match(fn, /pa\.status in \('created', 'pending', 'processing', 'paid', 'reflecting'\)/);
  assert.match(read("app/api/payments/paymob/intention/route.ts"), /COUPON_LIMIT_REACHED/);
});

test("every new/rewritten function in the corrective migration is service_role-only or a customer-facing SELECT-only predicate, with a pinned search_path", () => {
  const definitions = migration.split(/create or replace function/).slice(1);
  for (const def of definitions) {
    assert.match(def, /set search_path = ''/, `missing pinned search_path:\n${def.slice(0, 100)}`);
  }
  for (const fn of [
    "public.admin_delete_brand_application(uuid, uuid, text)",
    "public.cancel_order(uuid)",
    "public.create_payment_attempt(uuid, text, uuid, text, integer, text, jsonb, jsonb, jsonb, integer)",
  ]) {
    const escaped = fn.replace(/[.()]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function ${escaped} from`), `${fn} missing REVOKE`);
    assert.match(migration, new RegExp(`grant execute on function ${escaped} to service_role`), `${fn} missing service_role GRANT`);
  }
});

// Corrective pass 2, Section 8: CFG-01 was previously called a "verified
// false positive" on the strength of this migration file alone. A
// migration existing in the repo is not proof it was ever applied to the
// production database, nor that the pg_cron job it creates is still
// scheduled and actually running there (pg_cron jobs live in the cron
// extension's own catalog, unaffected by this repo's migration history if
// someone later drops or reschedules the job by hand in production). This
// is downgraded to "repository-configured, requires production
// verification" — the exact read-only queries to run against production
// (never executed by this pass) are in the corrective-pass report.
test("CFG-01 (repository-configured, NOT independently verified against production): the migration that would schedule hourly product-visibility activation via pg_cron exists in this repo", () => {
  const cronMigration = read("supabase/migrations/20260815214231_product_visibility_activation_cron.sql");
  assert.match(cronMigration, /cron\.schedule\(\s*\n\s*'product-visibility-activation',\s*\n\s*'0 \* \* \* \*'/);
  assert.match(cronMigration, /private\.execute_scheduled_product_visibility_activation\(200\)/);
});
