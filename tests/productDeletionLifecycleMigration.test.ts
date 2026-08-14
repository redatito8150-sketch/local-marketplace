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
  // Corrective pass: DELETE grant added — the original omitted it entirely,
  // so nothing (including this project's own test cleanup helpers) could
  // ever remove a row directly.
  assert.ok(sql.includes("grantselect,insert,update,deleteonpublic.product_deletion_requeststoservice_role"));
  assert.doesNotMatch(migration, /create policy .* on public\.product_deletion_requests/i);
});

test("product_deletion_requests.product_id is nullable with ON DELETE SET NULL, and carries an immutable name/sku/image snapshot", () => {
  // Corrective pass fix for the structural bug that made successful
  // approval impossible: the original NOT NULL / ON DELETE RESTRICT
  // column meant admin_approve_product_deletion's own `delete from
  // products` could never succeed while the request row still referenced
  // it.
  assert.doesNotMatch(migration, /product_id text not null references public\.products/);
  assert.ok(sql.includes("product_idtextreferencespublic.products(id)ondeletesetnull"));
  assert.ok(sql.includes("product_nametextnotnulldefault''"));
  assert.ok(sql.includes("product_skutext,"));
  assert.ok(sql.includes("product_imagetext,"));
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

test("eligibility calculation is a single canonical function reused by every RPC, accepting an ignore-request-id for self-exclusion", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.compute_product_deletion_eligibility(p_product_idtext,p_ignore_request_iduuiddefaultnull)"));
  const occurrences = migration.match(/private\.compute_product_deletion_eligibility\(/g) ?? [];
  // Defined once, then called by get_product_deletion_eligibility,
  // delete_draft_product, request_product_deletion,
  // admin_update_deletion_request, and admin_approve_product_deletion —
  // never re-implemented.
  assert.ok(occurrences.length >= 6, `expected compute_product_deletion_eligibility to be defined once and called at least 5 times, saw ${occurrences.length} total occurrences`);
  // admin_update_deletion_request and admin_approve_product_deletion must
  // pass their own request id as the ignore param — the exact bug that
  // made approval impossible was DELETION_REQUEST_ALREADY_OPEN firing
  // against the very request being approved.
  assert.ok(sql.includes("private.compute_product_deletion_eligibility(v_product_id,p_request_id)"));
});

test("every lifecycle RPC is security definer, search_path-locked, and service_role-only", () => {
  for (const signature of [
    "public.get_product_deletion_eligibility(text,uuid)",
    "public.archive_product(text,uuid,uuid,text)",
    "public.restore_product(text,uuid,uuid,text)",
    "public.delete_draft_product(text,uuid,uuid,text)",
    "public.request_product_deletion(text,uuid,uuid,text,text,text)",
    "public.cancel_product_deletion_request(text,uuid,uuid,text)",
    "public.admin_update_deletion_request(uuid,uuid,text,text,text)",
    "public.admin_approve_product_deletion(uuid,uuid,text)",
    "public.admin_emergency_hide_product(text,uuid,text,text)",
    "public.admin_search_deletion_requests(text,uuid,boolean,text,integer,integer)",
  ]) {
    assert.ok(sql.includes(`revokeallonfunction${signature}frompublic,anon,authenticated`), `missing revoke for ${signature}`);
    assert.ok(sql.includes(`grantexecuteonfunction${signature}toservice_role`), `missing grant for ${signature}`);
  }
  // Every mutating function body carries `securitydefiner` + a locked
  // search_path, not just a bare `language plpgsql`.
  const definerCount = (sql.match(/securitydefinersetsearch_path=''/g) ?? []).length;
  assert.ok(definerCount >= 10, `expected at least 10 security definer functions with a locked search_path, saw ${definerCount}`);
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
  assert.ok(migration.includes("Always recompute — never trust the snapshot taken at request time"));
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
  assert.match(body, /v_can_delete_now := v_pristine and v_product\.status = 'draft' and v_open_request_id is null;/);
  assert.doesNotMatch(body, /p_force/i);
  assert.doesNotMatch(body, /p_override/i);
});

test("corrective pass: PRODUCT_NOT_DRAFT / PRODUCT_EVER_PUBLISHED never enter the shared blockers array", () => {
  // The original bug: an archived, previously-published product being
  // evaluated for a *request* (not an immediate draft-delete) always
  // picked up PRODUCT_NOT_DRAFT, which made canRequestDeletion/approval
  // impossible for any real product. Both codes must still exist (used
  // elsewhere/documented) but never via append_deletion_blocker.
  assert.doesNotMatch(migration, /append_deletion_blocker\([^)]*'PRODUCT_NOT_DRAFT'/);
  assert.doesNotMatch(migration, /append_deletion_blocker\([^)]*'PRODUCT_EVER_PUBLISHED'/);
});

test("corrective pass: a request is refused outright (no row created) when the product must be retained forever", () => {
  const body = migration.match(/create or replace function public\.request_product_deletion[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /mustRetainHistory'\)::boolean, false\) is true then/);
  assert.match(body, /no deletion request was created/);
});

test("corrective pass: idempotency replay validates actor and reason, not just the key", () => {
  const body = migration.match(/create or replace function public\.request_product_deletion[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /v_existing\.requested_by is distinct from p_actor_id or v_existing\.reason <> v_normalized_reason/);
  assert.match(body, /'IDEMPOTENCY_CONFLICT'/);
});

// SECOND CORRECTIVE PASS (item 1): restore_product no longer re-implements
// publish-readiness in SQL — it targets 'draft' unconditionally on
// completeness, leaving the real validation to the ordinary publish flow
// (validateProductInput), which the two-step archived -> draft ->
// published bypass otherwise routed around entirely.
test("second corrective pass: restore_product targets draft, not published, and sets the restore-in-progress flag", () => {
  const body = migration.match(/create or replace function public\.restore_product[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /set_config\('app\.product_restore_in_progress', 'on', true\)/);
  assert.match(body, /update public\.products set status = 'draft', draft_started_at = now\(\) where id = p_product_id/);
  assert.doesNotMatch(body, /status = 'published'/);
  // The heavy, partially-duplicated publish-readiness checks from the
  // first corrective pass are gone — restore no longer needs to know
  // about direct-vs-partner stock/launch rules at all.
  assert.doesNotMatch(body, /PRODUCT_NO_SELLABLE_STOCK|PRODUCT_NOT_LAUNCHED|PRODUCT_MISSING_REQUIRED_FIELDS/);
});

// SECOND CORRECTIVE PASS (item 1): the actual database-level boundary
// that makes the archived -> draft -> published two-step bypass
// impossible, independent of what any application route does.
test("second corrective pass: an archived product can only leave 'archived' via the restore-in-progress flag", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.enforce_archived_product_transition()"));
  const body = migration.match(/create or replace function private\.enforce_archived_product_transition[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /old\.status = 'archived' and new\.status <> 'archived'/);
  assert.match(body, /current_setting\('app\.product_restore_in_progress', true\)/);
  assert.match(body, /raise exception 'PRODUCT_ARCHIVED_TRANSITION_REQUIRES_RESTORE'/);
  assert.ok(sql.includes("createtriggerproducts_enforce_archived_transition"));
  assert.ok(sql.includes("beforeupdateofstatusonpublic.products"));
});

// SECOND CORRECTIVE PASS (item 2): media ownership is now proven by DB
// association (any URL actually stored against this product_id in
// product_media/product_color_images/products.image/products.images),
// not by pattern-matching the URL against `products/{id}/...` — which
// silently missed the temp-folder paths real uploads commonly still live
// under (products/{tempId}/... for admin, product-drafts/{userId}/
// {tempId}/... for brand-portal — see components/admin/ProductForm.tsx's
// uploadFolderId). Cleanup jobs are enqueued directly into
// storage_cleanup_jobs inside the SAME transaction as the delete, not as
// a separate step in application code afterward.
test("second corrective pass: media ownership is DB-association-based and cleanup is enqueued transactionally", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.capture_owned_product_media_urls("));
  const captureBody = migration.match(/create or replace function private\.capture_owned_product_media_urls[\s\S]*?\$\$;/)?.[0] ?? "";
  // No products/{id}/ path-prefix requirement anymore — only proven
  // DB association (product_id) plus a genuine Supabase Storage public
  // URL shape, and exclusion of anything another live product also
  // references (never deletes shared media).
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

  for (const fnName of ["delete_draft_product", "admin_approve_product_deletion"]) {
    const body = migration.match(new RegExp(`create or replace function public\\.${fnName}[\\s\\S]*?\\$\\$;`))?.[0] ?? "";
    const queueIndex = body.indexOf("private.queue_owned_product_media_cleanup(");
    const deleteIndex = body.indexOf("delete from public.products");
    assert.ok(queueIndex >= 0, `${fnName} must enqueue media cleanup`);
    assert.ok(deleteIndex > queueIndex, `${fnName} must enqueue cleanup before deleting the product (same transaction, delete-first would risk losing targets on failure)`);
  }
});

test("corrective pass: order_items trigger resolves the product through variant_id when product_id is null", () => {
  const body = migration.match(/create or replace function private\.enforce_order_item_product_available[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /if v_product_id is null and new\.variant_id is not null then/);
  assert.match(body, /select product_id into v_product_id from public\.product_variants where id = new\.variant_id/);
});

test("corrective pass: admin review queue search/pagination happens inside a single database-level RPC", () => {
  assert.ok(sql.includes("createorreplacefunctionprivate.admin_search_deletion_requests("));
  const body = migration.match(/create or replace function private\.admin_search_deletion_requests[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(body, /limit v_limit offset v_offset/);
  assert.match(body, /ilike '%' \|\| v_search \|\| '%'/);
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 100\)/);
});
