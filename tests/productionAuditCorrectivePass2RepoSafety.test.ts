import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260821000000_production_audit_corrective_pass_2.sql");

// Static verification of corrective pass 2 (docs/audits/2026-08-20-
// production-security-correctness-reliability-audit-en.md, second
// corrective pass after the first was rejected). Source-presence checks
// only — see tests/liveSupabaseTestConfig.test.ts for the genuine
// behavioral coverage this pass could execute without a live database, and
// the corrective-pass-2 report for exactly which behaviors (refund
// allocation, coupon concurrency, archived-stock transition matrix,
// deletion/payment-creation concurrency, transactional audit rollback)
// still require a disposable Supabase project and were written but not
// executed.

test("Section 1: provider events, staff requests and order allocations are separate durable ledgers", () => {
  assert.match(migration, /create table public\.payment_refund_requests/);
  assert.match(migration, /create table public\.payment_refunds/);
  assert.match(migration, /create table public\.payment_refund_allocations/);
  assert.match(migration, /amount_cents integer not null check \(amount_cents > 0\)/);
  assert.match(migration, /provider_reference text not null unique/);
  assert.match(migration, /provider_event_id text not null unique/);
  assert.match(migration, /order_id uuid references public\.orders\(id\)/);
  assert.match(migration, /payment_refunds_immutable/);
  assert.match(migration, /payment_refund_allocations_one_active_refund_idx[\s\S]*where reversed_at is null/);
  const allocator = migration.slice(migration.lastIndexOf("create or replace function public.allocate_provider_refund"));
  const allocatorBody = allocator.slice(0, allocator.indexOf("$$;"));
  assert.match(allocatorBody, /v_request\.payment_attempt_id <> v_refund\.payment_attempt_id/);
  assert.match(allocatorBody, /v_request\.amount_cents <> v_refund\.amount_cents/);
  assert.match(allocatorBody, /PROVIDER_REFUND_ALREADY_ALLOCATED/);
  assert.match(allocatorBody, /refund_id = p_refund_id and reversed_at is null/);
});

test("Section 1: a staff request never updates payment status; only a provider-confirmed allocation can do that", () => {
  const fn = migration.slice(migration.lastIndexOf("create or replace function public.request_order_refund"));
  const fnBody = fn.slice(0, fn.indexOf("$$;"));
  assert.match(fnBody, /REFUND_EXCEEDS_CAPTURED_BALANCE/);
  assert.doesNotMatch(fnBody, /update public\.orders/);
  const providerFn = migration.slice(migration.lastIndexOf("create or replace function public.record_provider_refund_confirmation"));
  const providerBody = providerFn.slice(0, providerFn.indexOf("$$;"));
  assert.match(providerBody, /provider_event_id/);
  assert.match(providerBody, /private\.try_match_provider_refund/);
  assert.match(migration, /private\.recompute_order_refund_status/);
});

test("Section 1: cancel_order blocks both 'paid' and 'partially_refunded' card orders, only 'refunded' unblocks cancellation", () => {
  const fn = migration.slice(migration.lastIndexOf("create or replace function public.cancel_order(p_order_id uuid)"));
  const fnBody = fn.slice(0, fn.indexOf("$$;"));
  assert.match(fnBody, /v_payment_status in \('paid', 'partially_refunded'\)/);
  assert.match(fnBody, /PAID_ORDER_REQUIRES_REFUND_REVIEW/);
});

test("Section 1: admin routes create pending requests and cannot submit provider confirmation fields", () => {
  const route = read("app/api/admin/orders/[id]/refund/route.ts");
  assert.match(route, /request_order_refund/);
  assert.doesNotMatch(route, /providerReference/);
  const component = read("components/admin/RecordOrderRefundAction.tsx");
  assert.match(component, /waiting for Paymob confirmation/);

  const attemptRoute = read("app/api/admin/payments/[id]/mark-refunded/route.ts");
  assert.match(attemptRoute, /request_payment_attempt_refund/);
  assert.doesNotMatch(attemptRoute, /providerReference/);
  const attemptComponent = read("components/admin/RefundQueueActions.tsx");
  assert.match(attemptComponent, /verified provider reconciliation/);
  const webhook = read("app/api/payments/paymob/webhook/route.ts");
  assert.doesNotMatch(webhook, /record_provider_refund_confirmation/);
  assert.match(webhook, /signed callback does not authenticate the exact refunded amount/);
});

test("Section 1: replayed refund-state callbacks cannot duplicate Admin or Discord notifications", () => {
  const webhookRoute = read("app/api/payments/paymob/webhook/route.ts");
  const notifySource = read("lib/notify.ts");
  assert.match(migration, /alter table public\.notifications add column if not exists delivery_key text/);
  assert.match(migration, /create unique index if not exists notifications_delivery_key_idx/);
  assert.match(webhookRoute, /deliveryKey: `paymob-refund-state-observed:\$\{outcome\.providerEventId\}`/);
  assert.match(notifySource, /error\.code === "23505" && options\?\.deliveryKey/);
});

test("Section 2: Brand Portal impersonation maps operations to specific permissions for limited staff, while a full-rank admin keeps unrestricted access", () => {
  const policy = read("lib/admin/brandPortalPermissionPolicy.ts");
  assert.match(policy, /permission: "manage_orders"/);
  assert.match(policy, /permission: "manage_inventory"/);
  assert.match(policy, /permission: "manage_collections"/);
  assert.match(policy, /permission: "manage_products"/);
  assert.match(policy, /permission: "manage_page_studio"/);
  assert.match(policy, /permission: "moderate_reviews"/);
  assert.match(policy, /permission: "view_audit_log"/);
  assert.match(policy, /permission: "view_analytics"/);

  const brandAuth = read("lib/supabase/brandAuth.ts");
  assert.match(brandAuth, /isFullAdmin = profile\?\.role === "admin"/);
  assert.match(brandAuth, /if \(!isFullAdmin\) \{/);
  assert.match(brandAuth, /scopedAccessLevel = "assistant"/);
  assert.match(brandAuth, /hasRequiredBrandPortalPathPermission/);
});

test("Section 3: account deletion and payment-attempt creation serialize on the same profiles row lock, and payment snapshots are redacted before the auth user is gone", () => {
  assert.match(migration, /alter table public\.profiles add column if not exists pending_deletion_locked_at timestamptz;/);
  const lockFn = migration.slice(migration.indexOf("create or replace function public.lock_account_for_deletion"));
  const lockFnBody = lockFn.slice(0, lockFn.indexOf("$$;"));
  assert.match(lockFnBody, /perform 1 from public\.profiles where id = p_user_id for update;/);
  assert.match(lockFnBody, /PAYMENT_ATTEMPT_IN_PROGRESS/);

  const createAttemptFn = migration.slice(migration.lastIndexOf("create or replace function public.create_payment_attempt"));
  const createAttemptBody = createAttemptFn.slice(0, createAttemptFn.indexOf("$$;"));
  assert.match(createAttemptBody, /select pending_deletion_locked_at into v_deletion_locked_at\s*\n\s*from public\.profiles where id = p_user_id for update;/);
  assert.match(createAttemptBody, /ACCOUNT_DELETION_IN_PROGRESS/);
  assert.match(createAttemptBody, /interval '10 minutes'/);

  assert.match(migration, /create or replace function public\.redact_deleted_account_payment_snapshots/);

  const route = read("app/api/account/delete/route.ts");
  assert.match(route, /lock_account_for_deletion/);
  assert.match(route, /redact_deleted_account_payment_snapshots/);
  assert.match(route, /unlock_account_for_deletion/);
  // The redaction call must appear before the actual auth.admin.deleteUser
  // call (not just its mention in a comment) in the route's source order,
  // matching the required "before the auth user is gone" sequencing.
  assert.ok(
    route.indexOf("redact_deleted_account_payment_snapshots") <
      route.indexOf("supabaseAdmin.auth.admin.deleteUser(user.id)")
  );
});

test("Section 4: the archived-stock guard exempts only the three named canonical restoration paths, via a transaction-local flag never client-settable", () => {
  const guardFn = migration.slice(migration.indexOf("create or replace function private.enforce_archived_product_variant_stock_guard"));
  const guardBody = guardFn.slice(0, guardFn.indexOf("$$;"));
  assert.match(guardBody, /current_setting\('private\.archived_stock_restoration_in_progress', true\) = 'on'/);

  const setConfigCalls = migration.match(/set_config\('private\.archived_stock_restoration_in_progress', 'on', true\)/g) ?? [];
  // cancel_order (1), post_warehouse_correction's reclassify/restore_to_sellable leg (1),
  // post_warehouse_correction's return_to_brand leg (1), resolve_warehouse_quarantine (1).
  assert.equal(setConfigCalls.length, 4, `expected exactly 4 set_config call sites, found ${setConfigCalls.length}`);

  // apply_inventory_adjustments and request_warehouse_transfer — the two
  // entry points PROD-02 actually named — are deliberately never
  // reproduced/redefined by this migration (only mentioned in prose,
  // explaining why they're excluded from the exemption).
  assert.doesNotMatch(migration, /create or replace function[\s\S]{0,40}apply_inventory_adjustments/);
  assert.doesNotMatch(migration, /create or replace function[\s\S]{0,40}request_warehouse_transfer/);
});

test("Section 4: cancel_order's restock sets the archived-stock exemption before the increasing UPDATE", () => {
  const fn = migration.slice(migration.lastIndexOf("create or replace function public.cancel_order(p_order_id uuid)"));
  const fnBody = fn.slice(0, fn.indexOf("$$;"));
  const flagIndex = fnBody.indexOf("set_config('private.archived_stock_restoration_in_progress'");
  const updateIndex = fnBody.indexOf("set quantity = quantity + v_item.quantity");
  assert.ok(flagIndex > -1 && updateIndex > -1 && flagIndex < updateIndex, "the exemption flag must be set before the restock UPDATE");
});

test("Section 5: card coupon conversion is inside the place_paid_order database transaction", () => {
  assert.match(migration, /insert into private\.coupon_reservations \(coupon_code, payment_attempt_id\)\s*\n\s*select nullif\(pa\.coupon_snapshot ->> 'code', ''\), pa\.id/);
  assert.match(migration, /on conflict \(payment_attempt_id\) do nothing;/);

  const triggerFn = migration.slice(migration.lastIndexOf("create or replace function private.enforce_coupon_max_uses_guard"));
  const triggerBody = triggerFn.slice(0, triggerFn.indexOf("$$;"));
  assert.match(triggerBody, /new\.used_count \+ v_active_reservations > new\.max_uses/);
  assert.match(migration, /before update of used_count on public\.coupons/);

  const wrapper = migration.slice(migration.lastIndexOf("create or replace function public.place_paid_order"));
  const wrapperBody = wrapper.slice(0, wrapper.indexOf("$$;"));
  assert.match(wrapperBody, /private\.place_paid_order\(p_payment_attempt_id\)/);
  assert.match(wrapperBody, /delete from private\.coupon_reservations/);
  assert.match(wrapperBody, /insert into private\.coupon_redemptions/);
  const webhookRoute = read("app/api/payments/paymob/webhook/route.ts");
  assert.doesNotMatch(webhookRoute, /finalize_payment_attempt_coupon_redemption/);
  const codRoute = read("app/api/orders/route.ts");
  assert.match(codRoute, /COUPON_LIMIT_REACHED/);
});

test("Section 6: mark-refunded and order-refund routes require requireStaffRole(\"admin\"), matching the sensitivity of a financial write", () => {
  assert.match(read("app/api/admin/orders/[id]/refund/route.ts"), /requireStaffRole\("admin"\)/);
  assert.match(read("app/api/admin/payments/[id]/mark-refunded/route.ts"), /requireStaffRole\("admin"\)/);
});

test("Section 7: application deletion writes its mandatory audit_logs row inside the same transaction, using a curated safe snapshot, and p_actor_id/p_reason are actually persisted", () => {
  const fn = migration.slice(migration.lastIndexOf("create or replace function public.admin_delete_brand_application"));
  const fnBody = fn.slice(0, fn.indexOf("$$;"));
  assert.match(fnBody, /if p_actor_id is null then/);
  assert.match(fnBody, /insert into public\.audit_logs \(/);
  assert.match(fnBody, /p_actor_id, v_actor_label, 'application', p_application_id::text, 'delete',/);
  // The insert must appear before the deletes, in source order, so a
  // failure here rolls back the whole function.
  const auditIndex = fnBody.indexOf("insert into public.audit_logs");
  const deleteIndex = fnBody.indexOf("delete from public.brand_application_revisions");
  assert.ok(auditIndex > -1 && deleteIndex > -1 && auditIndex < deleteIndex);
  // A curated snapshot, never a raw to_jsonb(v_application) dump that would
  // carry the applicant's email/phone/legal documents into audit_logs.
  assert.doesNotMatch(fnBody.slice(0, auditIndex), /to_jsonb\(v_application\)/);

  const route = read("app/api/admin/applications/[id]/route.ts");
  assert.doesNotMatch(
    route.slice(route.indexOf("export async function DELETE")),
    /await logAudit\(\{/
  );
  assert.match(route, /sendToDiscord\("auditApplications"/);
});

test("Section 8: CFG-01 is documented as repository-configured, not independently verified against production, anywhere it's referenced in code comments", () => {
  const files = [
    "supabase/migrations/20260820000001_production_audit_corrective_fixes.sql",
    "tests/productionAuditCorrectivePassRepoSafety.test.ts",
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /verified false positive/i, `${file} still claims CFG-01 was verified`);
  }
});

test("every new/rewritten function in the corrective-pass-2 migration has a pinned search_path and is service_role-only (or a stable read predicate under the same discipline)", () => {
  const definitions = migration.split(/create or replace function/).slice(1);
  for (const def of definitions) {
    assert.match(def, /set search_path = ''/, `missing pinned search_path:\n${def.slice(0, 120)}`);
  }
  for (const fn of [
    "public.request_order_refund(uuid, uuid, integer, text)",
    "public.request_payment_attempt_refund(uuid, uuid, integer, text)",
    "public.record_provider_refund_confirmation(uuid, text, text, integer, text)",
    "public.allocate_provider_refund(uuid, uuid, uuid)",
    "public.reverse_order_refund_allocation(uuid, uuid, uuid, text)",
    "public.list_order_refund_summaries(uuid[])",
    "public.list_payment_attempts_needing_refund_review()",
    "public.cancel_order(uuid)",
    "public.lock_account_for_deletion(uuid)",
    "public.unlock_account_for_deletion(uuid)",
    "public.redact_deleted_account_payment_snapshots(uuid)",
    "public.create_payment_attempt(uuid, text, uuid, text, integer, text, jsonb, jsonb, jsonb, integer)",
    "public.place_paid_order(uuid)",
    "public.admin_delete_brand_application(uuid, uuid, text)",
  ]) {
    const escaped = fn.replace(/[.()[\]]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke all on function ${escaped} from`), `${fn} missing REVOKE`);
    assert.match(migration, new RegExp(`grant execute on function ${escaped} to service_role`), `${fn} missing service_role GRANT`);
  }
});
