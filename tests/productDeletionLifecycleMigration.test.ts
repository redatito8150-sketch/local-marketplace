import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static assertions against the product deletion lifecycle migration's
// actual SQL source — same convention as tests/stage4WarehouseStorage.test.ts.
// These pin structural/security properties that don't require a live
// database to verify (constraints, grants, lock ordering, blocker codes).
// Real behavioral coverage of the RPCs themselves lives in
// tests/productDeletionIntegration.test.ts, skip-gated on a live migrated
// database — this file exists to catch a regression to the SQL text
// itself, not to substitute for that behavioral coverage.
//
// THIRD PASS: this file was fully rewritten to match the automatic,
// database-authoritative schedule+hold model that replaced the old
// admin-approval deletion-request workflow. There is no
// product_deletion_requests table, no archive_product/request_product_
// deletion/admin_approve_product_deletion/admin_update_deletion_request
// functions, and no "requested/under_review/approved/rejected" statuses
// anywhere in the migration this file asserts against.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationPath = "supabase/migrations/20260814020000_product_deletion_lifecycle.sql";
const migration = readFileSync(path.join(rootDir, migrationPath), "utf8");

function compact(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, "");
}

const sql = compact(migration);

test("the old admin-approval product_deletion_requests model is fully gone, not just renamed", () => {
  assert.doesNotMatch(migration, /create table[^;]*product_deletion_requests/i);
  assert.doesNotMatch(migration, /create or replace function public\.archive_product\(/);
  assert.doesNotMatch(migration, /create or replace function public\.request_product_deletion\(/);
  assert.doesNotMatch(migration, /create or replace function public\.admin_approve_product_deletion\(/);
  assert.doesNotMatch(migration, /create or replace function public\.admin_update_deletion_request\(/);
  // Note: 'rejected' legitimately still appears elsewhere as a
  // warehouse_transfers.status value (transfer rejection) — unrelated to
  // the old deletion-request workflow — so this only checks the schedules
  // table's own status CHECK constraint, not the whole file.
  const schedulesTableBody = migration.match(/create table if not exists public\.product_deletion_schedules \([\s\S]*?\);/)?.[0] ?? "";
  assert.doesNotMatch(schedulesTableBody, /'requested'|'under_review'|'approved'|'rejected'/);
});

test("pg_trgm is created before any index that uses gin_trgm_ops", () => {
  const extIndex = migration.indexOf("create extension if not exists pg_trgm");
  const firstTrgmIndexUse = migration.indexOf("gin_trgm_ops");
  assert.ok(extIndex >= 0, "expected pg_trgm extension creation");
  assert.ok(firstTrgmIndexUse > extIndex, "expected pg_trgm extension to be created before any gin_trgm_ops index");
});

test("product_deletion_holds allows at most one active hold per product, RLS-enabled with no policy, service_role-only", () => {
  assert.ok(sql.includes("createuniqueindexifnotexistsproduct_deletion_holds_one_active_per_product_idx"));
  assert.ok(sql.includes("onpublic.product_deletion_holds(product_id)wherestatus='active'"));
  assert.ok(sql.includes("check(statusin('active','released'))"));
  assert.ok(sql.includes("altertablepublic.product_deletion_holdsenablerowlevelsecurity"));
  assert.ok(sql.includes("revokeallonpublic.product_deletion_holdsfrompublic,anon,authenticated"));
  assert.ok(sql.includes("grantselect,insert,update,deleteonpublic.product_deletion_holdstoservice_role"));
  assert.doesNotMatch(migration, /create policy .* on public\.product_deletion_holds/i);
});

test("product_deletion_schedules allows at most one active ('scheduled') schedule per product, RLS-enabled with no policy, service_role-only", () => {
  assert.ok(sql.includes("createuniqueindexifnotexistsproduct_deletion_schedules_one_active_per_product_idx"));
  assert.ok(sql.includes("onpublic.product_deletion_schedules(product_id)wherestatus='scheduled'"));
  assert.ok(sql.includes("check(statusin('scheduled','cancelled','blocked','completed'))"));
  assert.ok(sql.includes("altertablepublic.product_deletion_schedulesenablerowlevelsecurity"));
  assert.ok(sql.includes("revokeallonpublic.product_deletion_schedulesfrompublic,anon,authenticated"));
  assert.ok(sql.includes("grantselect,insert,update,deleteonpublic.product_deletion_schedulestoservice_role"));
  assert.doesNotMatch(migration, /create policy .* on public\.product_deletion_schedules/i);
});

test("product_deletion_schedules.product_id is nullable with ON DELETE SET NULL, and carries an immutable name/sku/image snapshot", () => {
  // A *completed* schedule must outlive the product it refers to once that
  // product is actually, permanently hard-deleted — the snapshot columns
  // keep the history record meaningful once product_id goes null. (Unlike
  // product_deletion_holds.product_id, which is deliberately NOT NULL /
  // ON DELETE CASCADE — a hold has no reason to outlive its product.)
  const schedulesTableBody = migration.match(/create table if not exists public\.product_deletion_schedules \([\s\S]*?\);/)?.[0] ?? "";
  assert.doesNotMatch(schedulesTableBody, /product_id text not null references public\.products/);
  assert.ok(sql.includes("product_idtextreferencespublic.products(id)ondeletesetnull"));
  assert.ok(sql.includes("product_nametextnotnulldefault''"));
  assert.ok(sql.includes("product_skutext,"));
  assert.ok(sql.includes("product_imagetext,"));
});

test("product_deletion_schedules has a due-date partial index scoped to status = 'scheduled' for the cron executor's working set", () => {
  assert.ok(sql.includes("createindexifnotexistsproduct_deletion_schedules_due_idx"));
  assert.ok(sql.includes("onpublic.product_deletion_schedules(due_at)wherestatus='scheduled'"));
});

test("product_deletion_schedules' trigram search index is built on the plain (not lower()-wrapped) column, matching the ILIKE queries that use it", () => {
  assert.ok(sql.includes("creatindexifnotexistsproduct_deletion_schedules_product_name_trgm_idx".replace("creatindex", "createindex")));
  assert.ok(sql.includes("usinggin(product_namegin_trgm_ops)"));
  assert.doesNotMatch(migration, /gin \(lower\(product_name\) gin_trgm_ops\)/);
});

test("deletion_requested_at is documented as a display-only mirror of the active schedule, never authoritative", () => {
  assert.ok(sql.includes("commentoncolumnpublic.products.deletion_requested_atis"));
  assert.ok(migration.includes("Never authoritative"));
  assert.ok(migration.includes("product_deletion_schedules"));
});

test("every required blocker/result code is implemented", () => {
  const requiredCodes = [
    "PRODUCT_NOT_FOUND", "PRODUCT_NOT_OWNED", "PRODUCT_NOT_DRAFT", "PRODUCT_NOT_RETIRED",
    "PRODUCT_HAS_ORDER_HISTORY", "PRODUCT_HAS_OPEN_ORDERS", "PRODUCT_HAS_REVIEWS",
    "PRODUCT_HAS_INVENTORY_HISTORY", "PRODUCT_HAS_AVAILABLE_STOCK", "PRODUCT_HAS_RESERVED_STOCK",
    "PRODUCT_HAS_INCOMING_STOCK", "PRODUCT_HAS_WAREHOUSE_HISTORY", "PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT",
    "PRODUCT_HAS_RETURN_HISTORY", "PRODUCT_HAS_OPEN_RETURN", "PRODUCT_HAS_QUARANTINE",
    "PRODUCT_HAS_OPEN_FULFILLMENT_TRANSITION", "PRODUCT_HAS_ACTIVE_HOLD", "PRODUCT_MUST_BE_RETAINED",
    "PRODUCT_DELETION_BLOCKED", "DELETION_ALREADY_SCHEDULED", "DELETION_SCHEDULE_ALREADY_ACTIVE",
    "DELETION_SCHEDULE_NOT_FOUND", "DELETION_ELIGIBILITY_CHANGED", "DELETION_SCHEDULED",
    "DELETION_SCHEDULE_CANCELLED", "RETIRE_STATE_CONFLICT", "ALREADY_RETIRED", "RETIRED", "RESTORED",
    "DRAFT_DELETED", "EMERGENCY_HIDDEN", "REASON_REQUIRED", "ALREADY_ON_HOLD", "HOLD_APPLIED",
    "HOLD_RELEASED", "HOLD_NOT_FOUND", "IDEMPOTENCY_CONFLICT", "NOT_AUTHORIZED",
    "PRODUCT_ARCHIVED_TRANSITION_REQUIRES_RESTORE", "PRODUCT_NOT_AVAILABLE_FOR_ORDER",
  ];
  for (const code of requiredCodes) {
    assert.ok(migration.includes(code), `missing blocker/result code: ${code}`);
  }
});

test("eligibility calculation is a single canonical function reused by every RPC, accepting an ignore-schedule-id for self-exclusion", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.compute_product_deletion_eligibility(p_product_idtext,p_ignore_schedule_iduuiddefaultnull)"));
  const occurrences = migration.match(/private\.compute_product_deletion_eligibility\(/g) ?? [];
  // Defined once, then called by get_product_deletion_eligibility,
  // delete_draft_product, schedule_product_deletion,
  // execute_due_product_deletions, and search_retired_products (lateral,
  // per row) — never re-implemented.
  assert.ok(occurrences.length >= 6, `expected compute_product_deletion_eligibility to be defined once and called at least 5 times, saw ${occurrences.length} total occurrences`);
  // schedule_product_deletion and execute_due_product_deletions must pass
  // their own schedule id as the ignore param — a schedule's own active
  // state must never block its own creation-time/execution-time
  // eligibility recompute.
  assert.ok(sql.includes("private.compute_product_deletion_eligibility(v_product_id,v_schedule_id)"));
});

test("every lifecycle RPC is security definer, search_path-locked, and service_role-only", () => {
  for (const signature of [
    "public.get_product_deletion_eligibility(text,uuid)",
    "public.retire_product(text,uuid,uuid,text)",
    "public.restore_product(text,uuid,uuid,text)",
    "public.delete_draft_product(text,uuid,uuid,text)",
    "public.schedule_product_deletion(text,uuid,uuid,text,text,text)",
    "public.cancel_product_deletion_schedule(text,uuid,uuid,text)",
    "public.admin_emergency_hide_product(text,uuid,text,text)",
    "public.apply_product_deletion_hold(text,uuid,text,text)",
    "public.release_product_deletion_hold(text,uuid,text)",
    "public.execute_due_product_deletions(integer)",
    "public.admin_search_deletion_schedules(text,uuid,boolean,text,integer,integer)",
    "public.search_retired_products(uuid,text,integer,integer)",
  ]) {
    assert.ok(sql.includes(`revokeallonfunction${signature}frompublic,anon,authenticated`), `missing revoke for ${signature}`);
    assert.ok(sql.includes(`grantexecuteonfunction${signature}toservice_role`), `missing grant for ${signature}`);
  }
  // Every mutating function body carries `securitydefiner` + a locked
  // search_path, not just a bare `language plpgsql`.
  const definerCount = (sql.match(/securitydefinersetsearch_path=''/g) ?? []).length;
  assert.ok(definerCount >= 12, `expected at least 12 security definer functions with a locked search_path, saw ${definerCount}`);
});

test("schedule_product_deletion and cancel_product_deletion_schedule lock the product row before locking any schedule row", () => {
  // User-facing callers use products -> variants -> schedules ordering
  // (the product row is always the first thing locked). The cron executor
  // below necessarily reverses this (it doesn't know which products are
  // due without first querying schedules) — the only real conflict
  // scenario, cancel racing execute on the exact same schedule row, is
  // handled by both sides locking that literal row with `for update`
  // (Postgres's deadlock detector is the residual safety net, not the
  // primary mechanism).
  const scheduleBody = migration.match(/create or replace function public\.schedule_product_deletion[\s\S]*?\$\$;/)?.[0] ?? "";
  const cancelBody = migration.match(/create or replace function public\.cancel_product_deletion_schedule[\s\S]*?\$\$;/)?.[0] ?? "";

  const productLockIndex = scheduleBody.indexOf("from public.products where id = p_product_id for update");
  const scheduleLockIndex = scheduleBody.indexOf("where product_id = p_product_id and status = 'scheduled' for update");
  assert.ok(productLockIndex >= 0 && scheduleLockIndex >= 0);
  assert.ok(scheduleLockIndex > productLockIndex, "schedule_product_deletion must lock the product before locking any schedule row");

  const cancelProductLockIndex = cancelBody.indexOf("from public.products where id = p_product_id for update");
  const cancelScheduleLockIndex = cancelBody.indexOf("from public.product_deletion_schedules\n  where product_id = p_product_id and status = 'scheduled' for update");
  assert.ok(cancelProductLockIndex >= 0 && cancelScheduleLockIndex >= 0);
  assert.ok(cancelScheduleLockIndex > cancelProductLockIndex, "cancel_product_deletion_schedule must lock the product before locking the schedule row");
});

test("the cron executor claims a bounded batch of due schedules with FOR UPDATE SKIP LOCKED, then locks each product and its variants", () => {
  const body = migration.match(/create or replace function private\.execute_due_product_deletions[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /where status = 'scheduled' and due_at <= now\(\)/);
  assert.match(body, /order by due_at\s*\n\s*limit greatest\(1, least\(coalesce\(p_batch_size, 25\), 200\)\)\s*\n\s*for update skip locked/);
  const cursorIndex = body.indexOf("for update skip locked");
  const productLockIndex = body.indexOf("from public.products where id = v_product_id for update");
  const variantLockIndex = body.indexOf("from public.product_variants where product_id = v_product_id for update");
  assert.ok(cursorIndex >= 0 && productLockIndex >= 0 && variantLockIndex >= 0);
  assert.ok(productLockIndex > cursorIndex, "products must be locked after the schedule cursor claims its batch");
  assert.ok(variantLockIndex > productLockIndex, "variants must be locked after the product row");
  // Each schedule is processed in its own implicit-savepoint block, so one
  // schedule's failure doesn't roll back the rest of an already-committed
  // batch's earlier iterations.
  assert.match(body, /exception when others then/);
});

test("execute_due_product_deletions passes each schedule's own id as the ignore-schedule so it never blocks itself", () => {
  const body = migration.match(/create or replace function private\.execute_due_product_deletions[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /private\.compute_product_deletion_eligibility\(v_product_id, v_schedule_id\)/);
});

test("schedule_product_deletion never creates a row when the product must be retained forever or has any current blocker", () => {
  const body = migration.match(/create or replace function public\.schedule_product_deletion[\s\S]*?\$\$;/)?.[0] ?? "";
  const mustRetainCheckIndex = body.indexOf("mustRetainHistory')::boolean, false) is true");
  const blockersCheckIndex = body.indexOf("jsonb_array_length(v_eligibility->'blockers') > 0");
  const insertIndex = body.indexOf("insert into public.product_deletion_schedules");
  assert.ok(mustRetainCheckIndex >= 0 && blockersCheckIndex >= 0 && insertIndex >= 0);
  assert.ok(insertIndex > mustRetainCheckIndex && insertIndex > blockersCheckIndex, "the schedule row must only be inserted after both the retain-forever and blocker checks pass");
  assert.match(body, /'code', 'PRODUCT_MUST_BE_RETAINED'/);
  assert.match(body, /'code', 'PRODUCT_DELETION_BLOCKED'/);
  // No "blocked" schedule row is ever created for a currently-ineligible
  // product — the caller just gets the blockers back and can retry once
  // they clear, rather than an impossible admin request sitting around.
  assert.doesNotMatch(body, /insert into public\.product_deletion_schedules[\s\S]*?'blocked'/);
});

test("schedule_product_deletion is idempotent via operation_key replay, validating actor and reason before treating it as a safe replay", () => {
  const body = migration.match(/create or replace function public\.schedule_product_deletion[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /where product_id = p_product_id and operation_key = p_operation_key/);
  assert.match(body, /v_existing\.initiated_by is distinct from p_actor_id or v_existing\.reason is distinct from v_normalized_reason/);
  assert.match(body, /'IDEMPOTENCY_CONFLICT'/);
  assert.match(body, /'code', 'DELETION_SCHEDULED', 'message', 'Deletion already scheduled\.'/);
});

test("retire_product and admin_emergency_hide_product are idempotent (already-retired is a safe no-op, not an error) and set retired_at", () => {
  const retireBody = migration.match(/create or replace function public\.retire_product[\s\S]*?\$\$;/)?.[0] ?? "";
  const hideBody = migration.match(/create or replace function public\.admin_emergency_hide_product[\s\S]*?\$\$;/)?.[0] ?? "";
  for (const body of [retireBody, hideBody]) {
    assert.match(body, /status = 'archived' then/);
    assert.match(body, /'ok', true, 'code', 'ALREADY_RETIRED'/);
    assert.match(body, /status = 'archived', retired_at = now\(\)/);
  }
});

test("admin_emergency_hide_product and apply_product_deletion_hold both require a non-empty reason", () => {
  const hideBody = migration.match(/create or replace function public\.admin_emergency_hide_product[\s\S]*?\$\$;/)?.[0] ?? "";
  const holdBody = migration.match(/create or replace function public\.apply_product_deletion_hold[\s\S]*?\$\$;/)?.[0] ?? "";
  for (const body of [hideBody, holdBody]) {
    assert.match(body, /coalesce\(nullif\(trim\(p_reason\), ''\), ''\) = ''/);
    assert.match(body, /'REASON_REQUIRED'/);
  }
});

test("apply_product_deletion_hold refuses a second active hold, and safely stops (not silently ignores) an active schedule by moving it to 'blocked'", () => {
  const body = migration.match(/create or replace function public\.apply_product_deletion_hold[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /'ALREADY_ON_HOLD'/);
  assert.match(body, /status = 'blocked', blocked_at = now\(\), blocked_reason = 'A legal\/admin hold was applied to this product\.'/);
  assert.match(body, /'scheduleStopped', v_schedule\.id is not null/);
});

test("release_product_deletion_hold never touches any deletion schedule (no auto-resume, no auto-reschedule)", () => {
  const body = migration.match(/create or replace function public\.release_product_deletion_hold[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.doesNotMatch(body, /product_deletion_schedules/);
  assert.match(body, /does not touch any deletion schedule/);
});

test("delete_draft_product and execute_due_product_deletions never report a zero-row delete as success", () => {
  const draftBody = migration.match(/create or replace function public\.delete_draft_product[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(draftBody, /delete from public\.products where id = p_product_id;\s*\n\s*if not found then\s*\n\s*return jsonb_build_object\('ok', false, 'code', 'DELETION_ELIGIBILITY_CHANGED'/);

  const executorBody = migration.match(/create or replace function private\.execute_due_product_deletions[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(executorBody, /delete from public\.products where id = v_product_id;\s*\n\s*if not found then/);
  // A failed delete inside the executor marks the schedule 'blocked', not
  // 'completed' — a crash/anomaly here must never leave a product deleted
  // without a retained history record, nor a schedule falsely marked done.
  assert.match(executorBody, /status = 'blocked', blocked_at = now\(\), blocked_reason = 'The product changed unexpectedly during deletion\.'/);
});

test("restore_product targets draft (never published) directly, and sets the restore-in-progress flag before its own update", () => {
  const body = migration.match(/create or replace function public\.restore_product[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /set_config\('app\.product_restore_in_progress', 'on', true\)/);
  assert.match(body, /update public\.products set status = 'draft', draft_started_at = now\(\), retired_at = null where id = p_product_id/);
  assert.doesNotMatch(body, /status = 'published'/);
  // No parallel publish-readiness re-implementation — getting back to
  // Published is left entirely to the ordinary edit-and-publish flow.
  assert.doesNotMatch(body, /PRODUCT_NO_SELLABLE_STOCK|PRODUCT_NOT_LAUNCHED|PRODUCT_MISSING_REQUIRED_FIELDS/);
});

test("restore_product refuses to restore while a deletion schedule is active", () => {
  const body = migration.match(/create or replace function public\.restore_product[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /where product_id = p_product_id and status = 'scheduled' for update/);
  assert.match(body, /'code', 'DELETION_SCHEDULE_ALREADY_ACTIVE'/);
});

test("an archived product can only leave 'archived' via the restore-in-progress flag (the DB-level boundary against the two-step bypass)", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.enforce_archived_product_transition()"));
  const body = migration.match(/create or replace function private\.enforce_archived_product_transition[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /old\.status = 'archived' and new\.status <> 'archived'/);
  assert.match(body, /current_setting\('app\.product_restore_in_progress', true\)/);
  assert.match(body, /raise exception 'PRODUCT_ARCHIVED_TRANSITION_REQUIRES_RESTORE'/);
  assert.ok(sql.includes("createtriggerproducts_enforce_archived_transition"));
  assert.ok(sql.includes("beforeupdateofstatusonpublic.products"));
});

test("pristine-draft eligibility (canDeleteImmediately) is entirely database-derived, never a client-supplied flag, and requires no active hold", () => {
  const body = migration.match(/create or replace function private\.compute_product_deletion_eligibility[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /v_can_delete_now := v_pristine and v_product\.status = 'draft' and v_open_schedule_id is null and not v_has_hold;/);
  assert.doesNotMatch(body, /p_force/i);
  assert.doesNotMatch(body, /p_override/i);
});

test("PRODUCT_NOT_DRAFT / PRODUCT_EVER_PUBLISHED are pristine-draft-only and never enter the shared blockers array", () => {
  // A Retired, previously-published, history-free product must never see
  // these — they only feed canDeleteImmediately's own boolean via
  // v_pristine, since the pristine-draft-delete path is a completely
  // separate rule set from the Retired-product scheduling path.
  assert.doesNotMatch(migration, /append_deletion_blocker\([^)]*'PRODUCT_NOT_DRAFT'/);
  assert.doesNotMatch(migration, /append_deletion_blocker\([^)]*'PRODUCT_EVER_PUBLISHED'/);
});

test("immutable-history blockers set mustRetainHistory and are structurally distinct from operational blockers", () => {
  const body = migration.match(/create or replace function private\.compute_product_deletion_eligibility[\s\S]*?\$\$;/)?.[0] ?? "";
  const immutableCodes = ["PRODUCT_HAS_REVIEWS", "PRODUCT_HAS_ORDER_HISTORY", "PRODUCT_HAS_INVENTORY_HISTORY", "PRODUCT_HAS_WAREHOUSE_HISTORY", "PRODUCT_HAS_RETURN_HISTORY"];
  for (const code of immutableCodes) {
    const codeIndex = body.indexOf(`'${code}'`);
    assert.ok(codeIndex >= 0, `expected ${code} in the eligibility function`);
    const precedingSlice = body.slice(Math.max(0, codeIndex - 400), codeIndex);
    assert.match(precedingSlice, /v_must_retain := true;/);
  }
  const operationalCodes = [
    "PRODUCT_HAS_OPEN_ORDERS", "PRODUCT_HAS_AVAILABLE_STOCK", "PRODUCT_HAS_RESERVED_STOCK",
    "PRODUCT_HAS_INCOMING_STOCK", "PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT", "PRODUCT_HAS_QUARANTINE",
    "PRODUCT_HAS_OPEN_RETURN", "PRODUCT_HAS_OPEN_FULFILLMENT_TRANSITION", "PRODUCT_HAS_ACTIVE_HOLD",
  ];
  for (const code of operationalCodes) {
    const codeIndex = body.indexOf(`'${code}'`);
    assert.ok(codeIndex >= 0, `expected ${code} in the eligibility function`);
    const precedingSlice = body.slice(Math.max(0, codeIndex - 400), codeIndex);
    assert.doesNotMatch(precedingSlice, /v_must_retain := true;/);
  }
});

test("canScheduleDeletion requires status = 'archived', no retained history, and zero blockers of any kind", () => {
  const body = migration.match(/create or replace function private\.compute_product_deletion_eligibility[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /v_can_schedule := v_product\.status = 'archived' and not v_must_retain and jsonb_array_length\(v_blockers\) = 0;/);
});

test("an active deletion schedule for another schedule counts as a blocker, but the schedule being evaluated never blocks itself", () => {
  const body = migration.match(/create or replace function private\.compute_product_deletion_eligibility[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /v_open_schedule_excluding_self := v_open_schedule_id is not null\s*\n\s*and \(p_ignore_schedule_id is null or v_open_schedule_id <> p_ignore_schedule_id\);/);
  assert.match(body, /'DELETION_ALREADY_SCHEDULED'/);
});

test("order_items gains a defense-in-depth availability guard for every insert path, resolving via variant_id when product_id is null", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.enforce_order_item_product_available()"));
  assert.ok(sql.includes("raiseexception'product_not_available_for_order'"));
  assert.ok(sql.includes("createtriggerorder_items_enforce_product_available"));
  assert.ok(sql.includes("beforeinsertonpublic.order_items"));
  const body = migration.match(/create or replace function private\.enforce_order_item_product_available[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /if v_product_id is null and new\.variant_id is not null then/);
  assert.match(body, /select product_id into v_product_id from public\.product_variants where id = new\.variant_id/);
});

test("storefront_products excludes archived/paused/inactive-brand/un-launched products at the view level, not only via RLS", () => {
  const viewBody = migration.match(/create or replace view public\.storefront_products[\s\S]*?;\n\ngrant select/)?.[0] ?? "";
  assert.match(viewBody, /p\.status = 'published'/);
  assert.match(viewBody, /coalesce\(p\.paused_by_brand, false\) = false/);
  assert.match(viewBody, /b\.is_active = true/);
  assert.match(viewBody, /is_product_storefront_launch_gated/);
});

test("media ownership is DB-association-based and cleanup is enqueued transactionally, before every hard delete", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.capture_owned_product_media_urls("));
  const captureBody = migration.match(/create or replace function private\.capture_owned_product_media_urls[\s\S]*?\$\$;/)?.[0] ?? "";
  // No products/{id}/ path-prefix requirement — only proven DB association
  // (product_id) plus a genuine Supabase Storage public URL shape, and
  // exclusion of anything another live product also references.
  assert.doesNotMatch(captureBody, /products\/'\s*\|\|\s*p_product_id/);
  assert.match(captureBody, /storage_reference as url from public\.product_media where product_id = p_product_id/);
  assert.match(captureBody, /image_url as url from public\.product_color_images where product_id = p_product_id/);
  assert.match(captureBody, /unnest\(array_remove\(array\[p_image\] \|\| coalesce\(p_images, array\[\]::text\[\]\), null\)\)/);
  assert.match(captureBody, /like '%\/storage\/v1\/object\/public\/product-images\/%'/);
  assert.match(captureBody, /pm2\.product_id <> p_product_id/);
  assert.match(captureBody, /pci2\.product_id <> p_product_id/);
  assert.match(captureBody, /p2\.id <> p_product_id/);

  assert.ok(sql.includes("createorreplacefunctionprivate.queue_owned_product_media_cleanup("));
  const queueBody = migration.match(/create or replace function private\.queue_owned_product_media_cleanup[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(queueBody, /insert into public\.storage_cleanup_jobs \(bucket_id, storage_path, owner_user_id\)/);
  assert.match(queueBody, /on conflict \(bucket_id, storage_path\) do nothing/);

  // delete_draft_product enqueues before deleting.
  const draftBody = migration.match(/create or replace function public\.delete_draft_product[\s\S]*?\$\$;/)?.[0] ?? "";
  const draftQueueIndex = draftBody.indexOf("private.queue_owned_product_media_cleanup(");
  const draftDeleteIndex = draftBody.indexOf("delete from public.products");
  assert.ok(draftQueueIndex >= 0 && draftDeleteIndex > draftQueueIndex, "delete_draft_product must enqueue media cleanup before deleting the product");

  // execute_due_product_deletions enqueues before deleting too.
  const executorBody = migration.match(/create or replace function private\.execute_due_product_deletions[\s\S]*?\$\$;/)?.[0] ?? "";
  const executorQueueIndex = executorBody.indexOf("private.queue_owned_product_media_cleanup(");
  const executorDeleteIndex = executorBody.indexOf("delete from public.products where id = v_product_id;");
  assert.ok(executorQueueIndex >= 0 && executorDeleteIndex > executorQueueIndex, "execute_due_product_deletions must enqueue media cleanup before deleting the product");
});

test("admin_search_deletion_schedules and search_retired_products are single database-level RPCs with clamped, filtered, paginated queries", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.admin_search_deletion_schedules("));
  const scheduleSearchBody = migration.match(/create or replace function private\.admin_search_deletion_schedules[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(scheduleSearchBody, /limit v_limit offset v_offset/);
  assert.match(scheduleSearchBody, /ilike '%' \|\| v_search \|\| '%'/);
  assert.match(scheduleSearchBody, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 100\)/);
  assert.match(scheduleSearchBody, /hasActiveHold', exists\(select 1 from public\.product_deletion_holds h where h\.product_id = s\.product_id and h\.status = 'active'\)/);

  assert.ok(sql.includes("createorreplacefunctionprivate.search_retired_products("));
  const retiredSearchBody = migration.match(/create or replace function private\.search_retired_products[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(retiredSearchBody, /where p\.status = 'archived'/);
  assert.match(retiredSearchBody, /limit v_limit offset v_offset/);
  assert.match(retiredSearchBody, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 100\)/);
  // Each row's eligibility comes from the one canonical function, never a
  // second, divergent implementation.
  assert.match(retiredSearchBody, /'eligibility', private\.compute_product_deletion_eligibility\(p\.id\)/);
  assert.match(retiredSearchBody, /order by p\.retired_at desc nulls last/);
});

test("retired_at is a new nullable column, cleared on restore and set on retire/emergency-hide, sorted nulls-last so pre-migration rows are never mutated to fabricate a date", () => {
  assert.ok(sql.includes("altertablepublic.productsaddcolumnifnotexistsretired_attimestamptz"));
  assert.ok(sql.includes("retired_at=null"));
  const retiredSearchBody = migration.match(/create or replace function private\.search_retired_products[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(retiredSearchBody, /nulls last/);
});
