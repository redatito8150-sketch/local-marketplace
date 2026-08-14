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

test("product_deletion_requests enforces at most one non-terminal request per product", () => {
  assert.ok(sql.includes("createuniqueindexifnotexistsproduct_deletion_requests_one_open_per_product_idx"));
  assert.ok(sql.includes("onpublic.product_deletion_requests(product_id)wherestatusin('requested','under_review','blocked')"));
  assert.ok(sql.includes("check(statusin('requested','under_review','blocked','approved','rejected','cancelled','completed'))"));
});

test("product_deletion_requests has no RLS policy and is service_role-only", () => {
  assert.ok(sql.includes("altertablepublic.product_deletion_requestsenablerowlevelsecurity"));
  assert.ok(sql.includes("revokeallonpublic.product_deletion_requestsfrompublic,anon,authenticated"));
  assert.ok(sql.includes("grantselect,insert,updateonpublic.product_deletion_requeststoservice_role"));
  assert.doesNotMatch(migration, /create policy .* on public\.product_deletion_requests/i);
});

test("deletion_requested_at is documented as a display-only mirror, never authoritative", () => {
  assert.ok(sql.includes("commentoncolumnpublic.products.deletion_requested_atis"));
  assert.ok(migration.includes("Never authoritative"));
});

test("every required blocker code is implemented", () => {
  const requiredCodes = [
    "PRODUCT_NOT_FOUND", "PRODUCT_NOT_OWNED", "PRODUCT_NOT_DRAFT", "PRODUCT_EVER_PUBLISHED",
    "PRODUCT_HAS_ORDER_HISTORY", "PRODUCT_HAS_OPEN_ORDERS", "PRODUCT_HAS_REVIEWS",
    "PRODUCT_HAS_INVENTORY_HISTORY", "PRODUCT_HAS_AVAILABLE_STOCK", "PRODUCT_HAS_RESERVED_STOCK",
    "PRODUCT_HAS_INCOMING_STOCK", "PRODUCT_HAS_WAREHOUSE_HISTORY", "PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT",
    "PRODUCT_HAS_RETURN_HISTORY", "PRODUCT_HAS_OPEN_RETURN", "PRODUCT_HAS_QUARANTINE",
    "PRODUCT_HAS_OPEN_FULFILLMENT_TRANSITION", "PRODUCT_MUST_BE_RETAINED",
    "DELETION_REQUEST_ALREADY_OPEN", "DELETION_REQUEST_NOT_FOUND", "DELETION_REQUEST_STATE_CONFLICT",
    "DELETION_ELIGIBILITY_CHANGED", "NOT_AUTHORIZED",
  ];
  for (const code of requiredCodes) {
    assert.ok(migration.includes(code), `missing blocker/result code: ${code}`);
  }
});

test("eligibility calculation is a single canonical function reused by every RPC", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.compute_product_deletion_eligibility(p_product_idtext)"));
  const occurrences = migration.match(/private\.compute_product_deletion_eligibility\(/g) ?? [];
  // Defined once, then called by get_product_deletion_eligibility,
  // delete_draft_product, request_product_deletion,
  // admin_update_deletion_request, and admin_approve_product_deletion —
  // never re-implemented.
  assert.ok(occurrences.length >= 6, `expected compute_product_deletion_eligibility to be defined once and called at least 5 times, saw ${occurrences.length} total occurrences`);
});

test("every lifecycle RPC is security definer, search_path-locked, and service_role-only", () => {
  for (const signature of [
    "public.get_product_deletion_eligibility(text)",
    "public.archive_product(text,uuid,uuid,text)",
    "public.restore_product(text,uuid,uuid,text)",
    "public.delete_draft_product(text,uuid,uuid,text)",
    "public.request_product_deletion(text,uuid,uuid,text,text,text)",
    "public.cancel_product_deletion_request(text,uuid,uuid,text)",
    "public.admin_update_deletion_request(uuid,uuid,text,text,text)",
    "public.admin_approve_product_deletion(uuid,uuid,text)",
    "public.admin_emergency_hide_product(text,uuid,text,text)",
  ]) {
    assert.ok(sql.includes(`revokeallonfunction${signature}frompublic,anon,authenticated`), `missing revoke for ${signature}`);
    assert.ok(sql.includes(`grantexecuteonfunction${signature}toservice_role`), `missing grant for ${signature}`);
  }
  // Every mutating function body carries `securitydefiner` + a locked
  // search_path, not just a bare `language plpgsql`.
  const definerCount = (sql.match(/securitydefinersetsearch_path=''/g) ?? []).length;
  assert.ok(definerCount >= 9, `expected at least 9 security definer functions with a locked search_path, saw ${definerCount}`);
});

test("lock order is products -> product_variants -> product_deletion_requests everywhere a request row is also touched", () => {
  // admin_update_deletion_request and admin_approve_product_deletion learn
  // the product id from an unlocked read first, specifically so they can
  // still lock products/variants before locking the request row — see each
  // function's own comment. This assertion pins that both functions keep
  // the un-locked lookup (a plain `select product_id into` with no `for
  // update`) ahead of any `for update` lock, so a future edit can't
  // silently reintroduce the deadlock-prone reversed order.
  const adminUpdateBody = migration.match(/create or replace function public\.admin_update_deletion_request[\s\S]*?\$\$;/)?.[0] ?? "";
  const adminApproveBody = migration.match(/create or replace function public\.admin_approve_product_deletion[\s\S]*?\$\$;/)?.[0] ?? "";
  for (const body of [adminUpdateBody, adminApproveBody]) {
    const unlockedLookupIndex = body.indexOf("select product_id into v_product_id from public.product_deletion_requests where id = p_request_id;");
    const firstForUpdateIndex = body.indexOf("for update");
    assert.ok(unlockedLookupIndex >= 0, "expected the un-locked product_id lookup");
    assert.ok(firstForUpdateIndex > unlockedLookupIndex, "expected every `for update` lock to come after the un-locked product_id lookup");
  }
});

test("delete_draft_product and admin_approve_product_deletion never trust a stale eligibility snapshot", () => {
  assert.ok(sql.includes("v_eligibility:=private.compute_product_deletion_eligibility(p_product_id)"));
  assert.ok(migration.includes("Always recompute — never trust the snapshot taken at request time."));
});

test("zero-row deletes are never reported as success", () => {
  // Both delete_draft_product and admin_approve_product_deletion check
  // `if not found` immediately after their `delete from public.products`
  // statement and return DELETION_ELIGIBILITY_CHANGED instead of ok:true.
  const deleteStatements = migration.match(/delete from public\.products where id = [a-z_.]+;\s*\n\s*if not found then\s*\n\s*return jsonb_build_object\('ok', false, 'code', 'DELETION_ELIGIBILITY_CHANGED'/g) ?? [];
  assert.equal(deleteStatements.length, 2, "expected both delete_draft_product and admin_approve_product_deletion to guard against a zero-row delete");
});

test("archive and emergency-hide are idempotent (already-archived is a safe no-op, not an error)", () => {
  const archiveBody = migration.match(/create or replace function public\.archive_product[\s\S]*?\$\$;/)?.[0] ?? "";
  const hideBody = migration.match(/create or replace function public\.admin_emergency_hide_product[\s\S]*?\$\$;/)?.[0] ?? "";
  for (const body of [archiveBody, hideBody]) {
    assert.match(body, /status = 'archived' then/);
    assert.match(body, /'ok', true, 'code', 'ALREADY_ARCHIVED'/);
  }
});

test("admin_emergency_hide_product requires a non-empty reason", () => {
  const body = migration.match(/create or replace function public\.admin_emergency_hide_product[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /coalesce\(nullif\(trim\(p_reason\), ''\), ''\) = ''/);
});

test("admin_update_deletion_request requires a reason to reject", () => {
  const body = migration.match(/create or replace function public\.admin_update_deletion_request[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /p_new_status = 'rejected' and coalesce\(nullif\(trim\(p_admin_note\), ''\), ''\) = ''/);
});

test("request_product_deletion is idempotent via operation_key replay", () => {
  const body = migration.match(/create or replace function public\.request_product_deletion[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /where product_id = p_product_id and operation_key = p_operation_key/);
  assert.match(body, /'ok', true, 'code', 'DELETION_REQUESTED', 'message', 'Deletion request already recorded\.'/);
});

test("order_items gains a defense-in-depth availability guard for every insert path", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.enforce_order_item_product_available()"));
  assert.ok(sql.includes("raiseexception'product_not_available_for_order'"));
  assert.ok(sql.includes("createtriggerorder_items_enforce_product_available"));
  assert.ok(sql.includes("beforeinsertonpublic.order_items"));
});

test("storefront_products excludes archived/paused/inactive-brand products at the view level, not only via RLS", () => {
  const viewBody = migration.match(/create or replace view public\.storefront_products[\s\S]*?;\n\ngrant select/)?.[0] ?? "";
  assert.match(viewBody, /p\.status = 'published'/);
  assert.match(viewBody, /coalesce\(p\.paused_by_brand, false\) = false/);
  assert.match(viewBody, /b\.is_active = true/);
  assert.match(viewBody, /is_product_storefront_launch_gated/);
});

test("pristine-draft eligibility never trusts a client-supplied flag — it is entirely database-derived", () => {
  const body = migration.match(/create or replace function private\.compute_product_deletion_eligibility[\s\S]*?\$\$;/)?.[0] ?? "";
  // No parameter besides the product id itself feeds v_pristine/v_can_delete_now.
  assert.match(body, /v_can_delete_now := v_pristine and v_product\.status = 'draft' and not found;/);
  assert.doesNotMatch(body, /p_force/i);
  assert.doesNotMatch(body, /p_override/i);
});
