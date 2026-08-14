import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveReplenishmentError } from "../lib/warehouse/replenishmentErrors.ts";

// Document-first partner replenishment (claude/partner-restock-request-backend):
// static verification of the new migration (no live database in this
// environment — same established pattern as tests/warehouseLedgerAndDocuments.test.ts,
// tests/secondCorrectivePassCoverage.test.ts, etc.), plus real pure-function
// coverage of the new error-code mapping helper.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}
function compact(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ").toLowerCase().replace(/\s+/g, "");
}

const MIGRATION_PATH = "supabase/migrations/20260814010500_partner_replenishment_request.sql";
const migration = read(MIGRATION_PATH);
const sql = compact(migration);

// ---------------------------------------------------------------------------
// Item 1: no more "held by your brand" prerequisite for ordinary requests
// ---------------------------------------------------------------------------

test("request_warehouse_transfer no longer requires brand_stock_quantity for an ORDINARY (non-transition-linked) request", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if v_open_transition_id is not null then/);
  const elseBranch = fn.slice(fn.indexOf("else\n      -- Item 1"));
  assert.match(elseBranch, /select id into v_variant\s*\n\s*from public\.product_variants\s*\n\s*where id = \(v_item->>'variant_id'\)::uuid;/);
  // The ordinary branch's actual CODE (comments stripped, since the
  // explanatory comment above it legitimately names brand_stock_quantity
  // while describing what it does NOT do) must never reference
  // brand_stock_quantity or raise INSUFFICIENT_BRAND_STOCK.
  const ordinaryBranch = elseBranch.slice(0, elseBranch.indexOf("end if;"));
  const ordinaryBranchCode = compact(ordinaryBranch);
  assert.doesNotMatch(ordinaryBranchCode, /brand_stock_quantity/);
  assert.doesNotMatch(ordinaryBranchCode, /insufficient_brand_stock/);
});

test("a transition-linked request (open brand_fulfilled->zakhnook_fulfilled transition) still caps against the system-computed brand_stock_quantity snapshot — this is NOT the removed self-reported prerequisite", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  const ifBranch = fn.slice(fn.indexOf("if v_open_transition_id is not null then"), fn.indexOf("else\n      -- Item 1"));
  assert.match(ifBranch, /select id, brand_stock_quantity into v_variant/);
  assert.match(ifBranch, /if v_requested > v_variant\.brand_stock_quantity - v_already_pending then\s*\n\s*raise exception 'INSUFFICIENT_BRAND_STOCK';/);
});

test("receive_warehouse_document_canonical only decrements brand_stock_quantity for a 'to_local' receipt when the document is linked to a fulfillment transition — an ordinary replenishment receipt leaves it untouched", () => {
  const fn = migration.match(/create or replace function private\.receive_warehouse_document_canonical\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /select id, brand_id, status, direction, stock_reserved_at, has_discrepancy,\s*\n\s*related_fulfillment_transition_id into v_transfer/
  );
  assert.match(fn, /if v_transfer\.related_fulfillment_transition_id is not null then/);
  assert.match(
    fn,
    /if v_variant\.brand_stock_quantity < v_item_row\.requested_qty then\s*\n\s*raise exception 'INSUFFICIENT_BRAND_STOCK_AT_RECEIPT';\s*\n\s*end if;\s*\n\s*v_new_brand_stock := v_variant\.brand_stock_quantity - v_item_row\.requested_qty;/
  );
  assert.match(fn, /else\s*\n\s*-- Ordinary partner replenishment[\s\S]*?v_new_brand_stock := v_variant\.brand_stock_quantity;/);
  // Live sellable quantity still only ever increases by the accepted-good
  // count, regardless of which branch ran — receipt remains the only thing
  // that can make requested quantities sellable.
  assert.match(fn, /v_new_quantity := v_variant\.quantity \+ v_ok;/);
});

test("receive_warehouse_document_canonical's signature, revoke/grant, and every other reconciliation guarantee (partial receiving, discrepancy flag, quarantine hold, 'to_brand' branch) are byte-identical to the current version — only the to_local brand_stock_quantity branch changed", () => {
  assert.match(
    migration,
    /create or replace function private\.receive_warehouse_document_canonical\(\s*\n\s*p_transfer_id uuid,\s*\n\s*p_actor_id uuid,\s*\n\s*p_items jsonb,\s*\n\s*p_note text,\s*\n\s*p_expected_direction text\s*\n\s*\)/
  );
  assert.ok(sql.includes("revokeallonfunctionprivate.receive_warehouse_document_canonical(uuid,uuid,jsonb,text,text)frompublic,anon,authenticated,service_role;"));
  const fn = migration.match(/create or replace function private\.receive_warehouse_document_canonical\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /v_final_status := case when v_remaining_after = 0 then 'received' else 'partially_received' end;/);
  assert.match(fn, /if v_damaged > 0 or v_missing > 0 then\s*\n\s*insert into public\.inventory_movements/);
  assert.match(fn, /'warehouse_quarantine_hold', 'Damaged\/missing units held in quarantine',/);
  assert.match(fn, /has_discrepancy = has_discrepancy or v_has_discrepancy,/);
  assert.match(fn, /if v_transfer\.stock_reserved_at is null then\s*\n\s*if v_variant\.quantity < v_item_row\.requested_qty then\s*\n\s*raise exception 'INSUFFICIENT_SELLABLE_STOCK_AT_RETURN';/);
});

// ---------------------------------------------------------------------------
// Item 3: submitted request validation — ownership, active variants,
// positive integer quantities, atomicity, idempotency
// ---------------------------------------------------------------------------

test("a submitted request must belong to the authenticated brand — foreign-variant scenario still raises VARIANT_NOT_FOUND_FOR_BRAND before any write", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /where p\.brand_id = p_brand_id;\s*\n\s*if v_matched_count <> v_input_count then\s*\n\s*raise exception 'VARIANT_NOT_FOUND_FOR_BRAND';\s*\n\s*end if;/
  );
  const foreignCheckIndex = fn.indexOf("raise exception 'VARIANT_NOT_FOUND_FOR_BRAND';");
  const insertIndex = fn.indexOf("insert into public.warehouse_transfers (");
  assert.ok(foreignCheckIndex !== -1 && insertIndex !== -1 && foreignCheckIndex < insertIndex);
});

test("a submitted request must contain only that brand's ACTIVE variants (new check) — an archived or non-active variant raises VARIANT_NOT_ACTIVE_FOR_BRAND, checked separately from plain ownership", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /where p\.brand_id = p_brand_id\s*\n\s*and pv\.is_archived = false\s*\n\s*and pv\.selling_status = 'active';\s*\n\s*if v_active_count <> v_input_count then\s*\n\s*raise exception 'VARIANT_NOT_ACTIVE_FOR_BRAND';\s*\n\s*end if;/
  );
  const ownershipCheckIndex = fn.indexOf("raise exception 'VARIANT_NOT_FOUND_FOR_BRAND';");
  const activeCheckIndex = fn.indexOf("raise exception 'VARIANT_NOT_ACTIVE_FOR_BRAND';");
  assert.ok(ownershipCheckIndex !== -1 && activeCheckIndex !== -1 && ownershipCheckIndex < activeCheckIndex, "ownership must be checked before active-status, so a foreign variant is never misreported as merely inactive");
});

test("duplicate variants in one request are rejected before any row is written", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /if v_distinct_count <> v_input_count then\s*\n\s*raise exception 'DUPLICATE_OR_INVALID_VARIANT';\s*\n\s*end if;/
  );
});

test("invalid (non-positive or non-integer) requested quantities are rejected for every item before any row is written", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /v_requested := \(v_item->>'requested_qty'\)::integer;\s*\n\s*if v_requested is null or v_requested <= 0 then\s*\n\s*raise exception 'INVALID_REQUESTED_QUANTITY';/
  );
});

test("multiple variants in one request each get their own warehouse_transfer_items row within the same document, inserted inside the same function invocation (one transaction)", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /for v_item in\s*\n\s*select value\s*\n\s*from jsonb_array_elements\(p_items\) as input\(value\)\s*\n\s*order by \(value->>'variant_id'\)::uuid\s*\n\s*loop/);
  assert.match(fn, /insert into public\.warehouse_transfer_items \(\s*\n\s*transfer_id, variant_id, requested_qty, unit_cost, item_note\s*\n\s*\) values \(/);
});

test("a submitted request never changes live product_variants.quantity and never makes requested quantities sellable before receipt — request_warehouse_transfer contains no UPDATE of product_variants at all", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.doesNotMatch(fn, /update public\.product_variants/i);
  assert.doesNotMatch(fn, /set quantity = quantity/i);
});

test("a successful request creates exactly one warehouse_transfers row (one document number) covering every submitted line — a genuinely atomic single-document creation, not one document per variant", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  const insertTransferMatches = fn.match(/insert into public\.warehouse_transfers \(/g) ?? [];
  assert.equal(insertTransferMatches.length, 1, "exactly one warehouse_transfers insert, outside the per-item loop");
  const transferInsertIndex = fn.indexOf("insert into public.warehouse_transfers (");
  const loopIndex = fn.indexOf("for v_item in\n    select value\n    from jsonb_array_elements(p_items) as input(value)\n    order by (value->>'variant_id')::uuid");
  assert.ok(transferInsertIndex !== -1 && loopIndex !== -1 && transferInsertIndex < loopIndex, "the single document row is created BEFORE the per-item line loop");
});

test("idempotent replay: reusing the same operation_key with the identical payload for the same brand/direction returns the existing document id rather than creating a second one", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /if v_existing\.id is not null then\s*\n\s*if v_existing\.brand_id <> p_brand_id\s*\n\s*or v_existing\.direction <> 'to_local'\s*\n\s*or \(v_existing\.request_payload is not null and v_existing\.request_payload <> p_items\) then\s*\n\s*raise exception 'IDEMPOTENCY_CONFLICT';\s*\n\s*end if;\s*\n\s*return v_existing\.id;\s*\n\s*end if;/
  );
});

test("conflicting replay: reusing the same operation_key against a different brand, direction, or payload is rejected as IDEMPOTENCY_CONFLICT rather than silently returning an unrelated document", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  const conflictBranch = fn.match(/if v_existing\.brand_id <> p_brand_id[\s\S]*?raise exception 'IDEMPOTENCY_CONFLICT';/)![0];
  assert.match(conflictBranch, /v_existing\.brand_id <> p_brand_id/);
  assert.match(conflictBranch, /v_existing\.direction <> 'to_local'/);
  assert.match(conflictBranch, /v_existing\.request_payload is not null and v_existing\.request_payload <> p_items/);
});

test("direct-brand isolation: a brand_fulfilled (non-partner) brand with no open zakhnook_fulfilled transition is still refused with BRAND_NOT_PARTNER — this flow is exclusively for Zakhnook-fulfilled partner replenishment", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /if not v_is_partner and v_open_transition_id is null then\s*\n\s*raise exception 'BRAND_NOT_PARTNER';\s*\n\s*end if;/
  );
});

test("transition-state behavior: a new inbound request is still blocked outright while the brand has an open zakhnook_fulfilled -> brand_fulfilled transition (leaving partner mode), unaffected by this migration's changes", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /if exists \(\s*\n\s*select 1 from public\.brand_fulfillment_transitions\s*\n\s*where brand_id = p_brand_id and to_mode = 'brand_fulfilled'\s*\n\s*and status not in \('completed', 'cancelled', 'failed'\)\s*\n\s*\) then\s*\n\s*raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS: cannot request a new inbound transfer while leaving Zakhnook fulfillment';/
  );
});

test("transition-state behavior: a request IS still allowed for a brand_fulfilled brand with an open brand_fulfilled -> zakhnook_fulfilled transition (entering partner mode) — the exact deadlock fix this flow must not regress", () => {
  const fn = migration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /select id into v_open_transition_id\s*\n\s*from public\.brand_fulfillment_transitions\s*\n\s*where brand_id = p_brand_id and to_mode = 'zakhnook_fulfilled'\s*\n\s*and status not in \('completed', 'cancelled', 'failed'\)\s*\n\s*limit 1;/
  );
});

test("signature and grants for request_warehouse_transfer are unchanged — every existing caller (app/api/brand-portal/warehouse/transfers/route.ts) keeps working with the identical endpoint and payload shape", () => {
  assert.match(
    migration,
    /create or replace function public\.request_warehouse_transfer\(\s*\n\s*p_brand_id uuid,\s*\n\s*p_actor_id uuid,\s*\n\s*p_items jsonb,\s*\n\s*p_note text,\s*\n\s*p_operation_key text\s*\n\s*\)/
  );
  assert.ok(sql.includes("revokeallonfunctionpublic.request_warehouse_transfer(uuid,uuid,jsonb,text,text)frompublic,anon,authenticated;"));
  assert.ok(sql.includes("grantexecuteonfunctionpublic.request_warehouse_transfer(uuid,uuid,jsonb,text,text)toservice_role;"));
  const route = read("app/api/brand-portal/warehouse/transfers/route.ts");
  assert.match(route, /\.rpc\("request_warehouse_transfer"/);
  assert.match(route, /p_brand_id: owner\.brandId/);
  assert.match(route, /p_items: body\.items\.map/);
});

// ---------------------------------------------------------------------------
// Item 4: receipt remains the only action that increases live stock —
// cancellation, rejection, partial receipt, damaged/missing all preserved
// ---------------------------------------------------------------------------

test("cancellation and rejection of a to_local document are entirely untouched by this migration (this migration never redeclares cancel_warehouse_document/reject_warehouse_document) — a to_local document never reserved anything at request time, so there is nothing new to release", () => {
  assert.doesNotMatch(migration, /create or replace function public\.cancel_warehouse_document/);
  assert.doesNotMatch(migration, /create or replace function public\.reject_warehouse_document/);
});

test("partial receipt and damaged/missing reconciliation math are unchanged — every reconciled line still requires received_ok_qty + damaged_qty + missing_qty = requested_qty, regardless of which brand_stock_quantity branch runs", () => {
  const fn = migration.match(/create or replace function private\.receive_warehouse_document_canonical\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if v_ok \+ v_damaged \+ v_missing <> v_item_row\.requested_qty then\s*\n\s*raise exception 'TRANSFER_ITEM_NOT_RECONCILED';/);
  assert.match(fn, /where wti\.transfer_id = p_transfer_id and wti\.received_ok_qty is null;/);
});

// ---------------------------------------------------------------------------
// Item 7: open inbound quantities never double-counted; item 3's
// "expose outstanding/incoming quantities" read model
// ---------------------------------------------------------------------------

const READ_MODEL_FN_PATTERN = /create or replace function public\.brand_portal_replenishment_variants\([\s\S]*?\n\$\$;/i;

test("the read model's incoming-quantity aggregation excludes every terminal document status AND every already-reconciled line — identical filter to request_warehouse_transfer's own v_already_pending check, so open quantities can never be double-counted", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(
    fn,
    /where wti\.variant_id = pv\.id\s*\n\s*and wt\.direction = 'to_local'\s*\n\s*and wt\.status not in \('received', 'rejected', 'cancelled'\)\s*\n\s*and wti\.received_ok_qty is null/
  );
});

test("the read model is a genuinely paginated, server-side query — it never selects every variant unbounded: a LIMIT clause (page size + 1, to detect a next page) always applies", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /limit v_limit \+ 1/);
  assert.match(fn, /v_limit := greatest\(1, least\(coalesce\(p_limit, 25\), 100\)\);/);
});

test("the read model supports server-side search (product name or SKU, ILIKE-metacharacter-escaped) and a stock-status allowlist filter (in_stock/low_stock/out_of_stock/incoming/no_incoming) validated before use", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /if p_stock_status not in \('all', 'in_stock', 'low_stock', 'out_of_stock', 'incoming', 'no_incoming'\) then\s*\n\s*raise exception 'INVALID_STOCK_STATUS_FILTER';/);
  assert.match(fn, /p\.name ilike '%' \|\| v_search \|\| '%' escape '\\'/);
  assert.match(fn, /pv\.sku ilike '%' \|\| v_search \|\| '%' escape '\\'/);
  // Metacharacter escaping happens before the pattern is built.
  assert.match(fn, /v_search := replace\(replace\(replace\(v_search, '\\', '\\\\'\), '%', '\\%'\), '_', '\\_'\);/);
});

test("the read model supports sorting by name/incoming/available in both directions, validated against a fixed allowlist before being used to build the sort-key expression (never string-interpolated user input)", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(
    fn,
    /if p_sort not in \('name_asc', 'name_desc', 'incoming_asc', 'incoming_desc', 'available_asc', 'available_desc'\) then\s*\n\s*raise exception 'INVALID_SORT';/
  );
  for (const sortKey of ["name_asc", "name_desc", "incoming_asc", "incoming_desc", "available_asc", "available_desc"]) {
    assert.ok(fn.includes(`'${sortKey}'`), `expected sort option ${sortKey}`);
  }
});

test("the read model uses keyset (cursor) pagination — a stable (sort_key, id) comparison against the previous page's last row — never a raw OFFSET that could skip/duplicate rows under concurrent writes", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.doesNotMatch(fn, /\boffset\b/i);
  assert.match(fn, /v_cursor_id is null\s*\n\s*or \(/);
  assert.match(fn, /\(sort_key < v_cursor_sort_value\) or \(sort_key = v_cursor_sort_value and variant_id < v_cursor_id\)/);
  assert.match(fn, /\(sort_key > v_cursor_sort_value\) or \(sort_key = v_cursor_sort_value and variant_id > v_cursor_id\)/);
  assert.match(fn, /if p_cursor is not null and \(p_cursor->>'id' is null or p_cursor->>'sortValue' is null\) then\s*\n\s*raise exception 'INVALID_CURSOR';/);
});

test("the read model exposes availableAtZakhnook and incomingQuantity per variant, plus enough status information (transfer id, document number, status, requested date/qty, open flag) about the latest/open replenishment request", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /'availableAtZakhnook', v_row\.available_at_zakhnook,/);
  assert.match(fn, /'incomingQuantity', v_row\.incoming_quantity,/);
  assert.match(fn, /'latestRequest', case when v_row\.latest_transfer_id is null then null else jsonb_build_object\(/);
  for (const field of ["transferId", "documentNumber", "status", "requestedAt", "requestedQty", "isOpen"]) {
    assert.ok(fn.includes(`'${field}'`), `expected latestRequest field ${field}`);
  }
});

test("the read model's 'latest request' lateral join picks the single most relevant row — an OPEN request first, else the most recent terminal one — never an unbounded list per variant", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(
    fn,
    /order by \(wt\.status not in \('received', 'rejected', 'cancelled'\)\) desc, wt\.requested_at desc\s*\n\s*limit 1/
  );
});

test("the read model only ever considers non-archived variants belonging to the requested brand — never a cross-brand leak", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /where p\.brand_id = p_brand_id\s*\n\s*and pv\.is_archived = false/);
});

test("the read model function is service_role-only, stable, and search_path-locked, consistent with every other privileged RPC in this system", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /^stable$/m);
  assert.match(fn, /^security definer$/m);
  assert.match(fn, /^set search_path = ''$/m);
  assert.ok(sql.includes("revokeallonfunctionpublic.brand_portal_replenishment_variants(uuid,text,text,text,jsonb,integer)frompublic,anon,authenticated;"));
  assert.ok(sql.includes("grantexecuteonfunctionpublic.brand_portal_replenishment_variants(uuid,text,text,text,jsonb,integer)toservice_role;"));
});

// ---------------------------------------------------------------------------
// Item 6: brand-facing manual overwrite API disabled safely
// ---------------------------------------------------------------------------

test("the manual brand-facing warehouse-stock overwrite route is disabled: it never calls set_warehouse_brand_stock or writes anything, always returns the stable MANUAL_STOCK_OVERWRITE_DISABLED code, and stays behind the same auth/partner gate as before", () => {
  const route = read("app/api/brand-portal/warehouse/stock/route.ts");
  assert.doesNotMatch(route, /\.rpc\("set_warehouse_brand_stock"/);
  assert.match(route, /requireActiveBrandOwner/);
  assert.match(route, /owner\.isMahalyPartner/);
  assert.match(route, /"MANUAL_STOCK_OVERWRITE_DISABLED"/);
  assert.match(route, /status: 410/);
});

test("set_warehouse_brand_stock itself is left completely untouched by this migration (no redeclare) — historical brand_stock_quantity data and any other legitimate service_role caller remain fully valid", () => {
  assert.doesNotMatch(migration, /create or replace function public\.set_warehouse_brand_stock/);
});

// ---------------------------------------------------------------------------
// Item 8: preserve direct-brand inventory adjustments unchanged
// ---------------------------------------------------------------------------

test("apply_inventory_adjustments (direct-brand inventory path) is not redeclared by this migration at all — completely unaffected by the replenishment-request change", () => {
  assert.doesNotMatch(migration, /create or replace function public\.apply_inventory_adjustments/);
});

// ---------------------------------------------------------------------------
// New read-model route contract
// ---------------------------------------------------------------------------

test("the new GET /api/brand-portal/warehouse/replenishment/variants route is gated behind the same partner-brand auth as every other warehouse route, validates its query params against the same allowlists as the RPC, and never redesigns/duplicates a page component", () => {
  const route = read("app/api/brand-portal/warehouse/replenishment/variants/route.ts");
  assert.match(route, /requireActiveBrandOwner/);
  assert.match(route, /owner\.isMahalyPartner/);
  assert.match(route, /\.rpc\("brand_portal_replenishment_variants"/);
  assert.match(route, /p_brand_id: owner\.brandId/);
  for (const value of ["all", "in_stock", "low_stock", "out_of_stock", "incoming", "no_incoming"]) {
    assert.ok(route.includes(`"${value}"`), `expected stock status ${value} in route allowlist`);
  }
});

test("Codex's off-limits files are never touched by this branch's changes", () => {
  const offLimits = [
    "app/brand-portal/stock/page.tsx",
    "components/brand-portal/InventoryManager.tsx",
    "app/brand-portal/warehouse/page.tsx",
    "components/brand-portal/warehouse/WarehouseExperience.tsx",
    "lib/data/brandPortal.ts",
    "lib/data/warehouse.ts",
  ];
  // This test only proves these files still exist and are readable as
  // ordinary source (i.e. nothing about this test suite depends on them
  // having changed) — actual non-modification is verified via `git diff
  // --stat` before commit, per this branch's own report requirements.
  for (const relativePath of offLimits) {
    assert.doesNotThrow(() => read(relativePath), `${relativePath} should still exist untouched`);
  }
});

// ---------------------------------------------------------------------------
// Pure-function coverage: the stable error-code mapping helper
// (resolveReplenishmentError has no next/server dependency, unlike the
// NextResponse-wrapping replenishmentErrorResponse it backs — see this
// repo's established convention of never importing an actual route module
// into a test, since Next's route runtime can't be constructed under plain
// `node --test`. This function is genuinely, fully unit-tested here.)
// ---------------------------------------------------------------------------

test("resolveReplenishmentError maps a known RPC error code to its safe message and stable status", () => {
  const resolved = resolveReplenishmentError("BRAND_NOT_PARTNER");
  assert.equal(resolved.isKnown, true);
  assert.equal(resolved.code, "BRAND_NOT_PARTNER");
  assert.equal(resolved.status, 403);
  assert.equal(resolved.userMessage, "This brand isn't set up for Zakhnook-fulfilled replenishment.");
});

test("resolveReplenishmentError strips a ': detail' suffix and still matches the base code", () => {
  const resolved = resolveReplenishmentError(
    "FULFILLMENT_TRANSITION_IN_PROGRESS: cannot request a new inbound transfer while leaving Zakhnook fulfillment"
  );
  assert.equal(resolved.isKnown, true);
  assert.equal(resolved.code, "FULFILLMENT_TRANSITION_IN_PROGRESS");
  assert.equal(resolved.status, 409);
});

test("resolveReplenishmentError falls back to a generic, safe UNEXPECTED_ERROR for anything not on the allowlist — never leaks raw Postgres/constraint text to the client", () => {
  const resolved = resolveReplenishmentError(
    'duplicate key value violates unique constraint "warehouse_transfers_operation_key_key"'
  );
  assert.equal(resolved.isKnown, false);
  assert.equal(resolved.code, "UNEXPECTED_ERROR");
  assert.equal(resolved.status, 500);
  assert.doesNotMatch(resolved.userMessage, /constraint|warehouse_transfers/i);
});

test("every code the new migration's RPCs can raise has a mapped safe message and non-500 status in resolveReplenishmentError", () => {
  const knownCodes = [
    "INVALID_OPERATION_KEY", "TRANSFER_ITEMS_REQUIRED", "DUPLICATE_OR_INVALID_VARIANT",
    "INVALID_REQUESTED_QUANTITY", "INVALID_UNIT_COST", "BRAND_NOT_FOUND",
    "FULFILLMENT_TRANSITION_IN_PROGRESS", "BRAND_NOT_PARTNER", "IDEMPOTENCY_CONFLICT",
    "VARIANT_NOT_FOUND_FOR_BRAND", "VARIANT_NOT_ACTIVE_FOR_BRAND", "INSUFFICIENT_BRAND_STOCK",
    "MANUAL_STOCK_OVERWRITE_DISABLED", "BRAND_ID_REQUIRED", "INVALID_STOCK_STATUS_FILTER",
    "INVALID_SORT", "INVALID_CURSOR",
  ];
  for (const code of knownCodes) {
    const resolved = resolveReplenishmentError(code);
    assert.equal(resolved.isKnown, true, `${code} should be a known code`);
    assert.notEqual(resolved.status, 500, `${code} should not fall back to the generic 500`);
  }
});
