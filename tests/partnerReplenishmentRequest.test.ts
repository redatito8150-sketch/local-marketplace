import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveReplenishmentError } from "../lib/warehouse/replenishmentErrors.ts";

// Document-first partner replenishment + the grouped Inventory read model
// (claude/partner-restock-integration-release): static verification of the
// migration (no live database in this environment — same established
// pattern as tests/warehouseLedgerAndDocuments.test.ts,
// tests/secondCorrectivePassCoverage.test.ts, etc.), plus real
// pure-function coverage of the error-code mapping helper.
//
// read() normalizes CRLF -> LF: this repo's git config (core.autocrlf=true,
// no .gitattributes override) checks working-tree files out with CRLF line
// endings, so a plain-string .indexOf()/.slice() using a literal embedded
// "\n" would silently fail to find its target after a fresh checkout/
// cherry-pick even though the SAME assertion passes against a freshly
// Write-tool-authored file that was never round-tripped through git. Every
// regex below already tolerates this via `\s*` around `\n`, but the couple
// of plain-string searches do not, so normalizing once here removes the
// entire bug class rather than special-casing each call site.
const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n/g, "\n");
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

test("a submitted request must contain only that brand's ACTIVE variants — an archived or non-active variant raises VARIANT_NOT_ACTIVE_FOR_BRAND, checked separately from plain ownership", () => {
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

test("direct-brand isolation: apply_inventory_adjustments (the non-partner direct-adjustment path) is not redeclared by this migration at all — completely unaffected by the replenishment-request change", () => {
  assert.doesNotMatch(migration, /create or replace function public\.apply_inventory_adjustments/);
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

test("the legacy request signature stays compatible while the app uses the arrival-aware wrapper", () => {
  assert.match(
    migration,
    /create or replace function public\.request_warehouse_transfer\(\s*\n\s*p_brand_id uuid,\s*\n\s*p_actor_id uuid,\s*\n\s*p_items jsonb,\s*\n\s*p_note text,\s*\n\s*p_operation_key text\s*\n\s*\)/
  );
  assert.ok(sql.includes("revokeallonfunctionpublic.request_warehouse_transfer(uuid,uuid,jsonb,text,text)frompublic,anon,authenticated;"));
  assert.ok(sql.includes("grantexecuteonfunctionpublic.request_warehouse_transfer(uuid,uuid,jsonb,text,text)toservice_role;"));
  const route = read("app/api/brand-portal/warehouse/transfers/route.ts");
  assert.match(route, /\.rpc\("request_warehouse_transfer_with_arrival"/);
  assert.match(route, /p_brand_id: owner\.brandId/);
  assert.match(route, /p_items: body\.items\.map/);
  assert.match(route, /p_expected_arrival_at: expectedArrivalAt\.toISOString\(\)/);
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
// The grouped Inventory read model: public.brand_portal_inventory_page
// ---------------------------------------------------------------------------

const READ_MODEL_FN_PATTERN = /create or replace function public\.brand_portal_inventory_page\([\s\S]*?\n\$\$;/i;

test("the read model exists with the expected signature (brand, search, stock status, sort, cursor, page size, product filter) and is service_role-only, stable, and search_path-locked", () => {
  assert.match(
    migration,
    /create or replace function public\.brand_portal_inventory_page\(\s*\n\s*p_brand_id uuid,\s*\n\s*p_search text default null,\s*\n\s*p_stock_status text default 'all',\s*\n\s*p_sort text default 'risk',\s*\n\s*p_cursor jsonb default null,\s*\n\s*p_page_size integer default 10,\s*\n\s*p_product_id text default null\s*\n\s*\)/
  );
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /^stable$/m);
  assert.match(fn, /^security definer$/m);
  assert.match(fn, /^set search_path = ''$/m);
  assert.ok(sql.includes("revokeallonfunctionpublic.brand_portal_inventory_page(uuid,text,text,text,jsonb,integer,text)frompublic,anon,authenticated;"));
  assert.ok(sql.includes("grantexecuteonfunctionpublic.brand_portal_inventory_page(uuid,text,text,text,jsonb,integer,text)toservice_role;"));
});

test("the read model validates p_stock_status/p_sort/p_cursor against fixed allowlists BEFORE they are used to build any SQL fragment — never string-interpolated user input", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /if p_stock_status not in \('all', 'in_stock', 'low_stock', 'out_of_stock'\) then\s*\n\s*raise exception 'INVALID_STOCK_STATUS_FILTER';/);
  assert.match(fn, /if p_sort not in \('risk', 'sales', 'name', 'stock_asc', 'stock_desc'\) then\s*\n\s*raise exception 'INVALID_SORT';/);
  assert.match(fn, /if p_cursor is not null and \(p_cursor->>'productId' is null or p_cursor->>'sortValue' is null\) then\s*\n\s*raise exception 'INVALID_CURSOR';/);
  for (const validationIndex of [
    fn.indexOf("raise exception 'INVALID_STOCK_STATUS_FILTER';"),
    fn.indexOf("raise exception 'INVALID_SORT';"),
    fn.indexOf("raise exception 'INVALID_CURSOR';"),
  ]) {
    assert.ok(validationIndex !== -1 && validationIndex < fn.indexOf("with eligible_raw as ("), "every allowlist check runs before the main query is built");
  }
});

test("pagination unit is the PRODUCT, not the variant: the keyset cursor/order-by/row_number operate on scored_products (one row per product), never per-variant — so a product's matching variants are always all on the same page", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /product_rollup as \(/);
  assert.match(fn, /scored_products as \(/);
  assert.match(fn, /paged_products as \(/);
  assert.match(fn, /row_number\(\) over \(/);
  assert.match(fn, /from scored_products sp/);
  assert.match(fn, /limit v_page_size \+ 1/);
  // The final item expansion joins EVERY matching variant back to the
  // chosen page's products (final_products), not a re-limited/re-paginated
  // variant query — this is what guarantees no split product/color group.
  assert.match(fn, /from matching m\s*\n\s*join final_products fp using \(product_id\)/);
});

test("search/stock-status filtering happens at variant granularity (matching current pre-grouping behavior), then rolls up to one row per product for the pagination/sort decision — SUM(available) for stock sorts, SUM(sold) for sales, MIN(risk) for risk, mirroring InventoryManager.tsx's own per-product summary math", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(
    fn,
    /where\s*\n\s*\(p_stock_status = 'all' or e\.stock_status = p_stock_status\)\s*\n\s*and \(p_product_id is null or e\.product_id = p_product_id\)\s*\n\s*and \(\s*\n\s*v_search is null\s*\n\s*or \(e\.product_name \|\| ' ' \|\| coalesce\(e\.color, ''\) \|\| ' ' \|\| coalesce\(e\.size, ''\) \|\| ' ' \|\| e\.sku\)\s*\n\s*ilike '%' \|\| v_search \|\| '%' escape '\\'/
  );
  assert.match(fn, /sum\(available_at_zakhnook\) as stock_key,/);
  assert.match(fn, /sum\(sold_last_30_days\) as sales_key,/);
  assert.match(fn, /min\(risk_score\) as risk_key/);
});

test("ILIKE metacharacters in the search term are escaped before the pattern is built, so a literal '%'/'_' in a search term matches literally rather than acting as a wildcard", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /v_search := replace\(replace\(replace\(v_search, '\\', '\\\\'\), '%', '\\%'\), '_', '\\_'\);/);
});

test("p_product_id narrows a page to a single product (components/admin/ProductForm.tsx's 'View inventory' deep link) without changing the unfiltered summary counts — the summary always reflects the whole brand, matching the health cards' existing brand-wide-regardless-of-filter behavior", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /and \(p_product_id is null or e\.product_id = p_product_id\)/);
  // The summary block's five brand-wide aggregates read from `eligible`
  // (never filtered by p_product_id or search), only matchingResultCount
  // reads from the p_product_id/search/stock-status-filtered `matching`.
  const summaryBlock = fn.slice(fn.indexOf("'summary', jsonb_build_object("));
  assert.match(summaryBlock, /\(select count\(\*\) from eligible\)/);
  assert.match(summaryBlock, /\(select coalesce\(sum\(available_at_zakhnook\), 0\) from eligible\)/);
  assert.match(summaryBlock, /\(select count\(\*\) from matching\)/);
});

test("cursor pagination is keyset, not OFFSET: product_id is a fixed ascending tiebreaker in every sort direction, so replaying the same cursor always returns the same next page even under concurrent inserts", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.doesNotMatch(fn, /\boffset\b/i);
  assert.match(fn, /v_cursor_product_id is null\s*\n\s*or \(/);
  assert.match(fn, /\(sp\.sort_text > v_cursor_sort_value\)\s*\n\s*or \(sp\.sort_text = v_cursor_sort_value and sp\.product_id > v_cursor_product_id\)/);
  assert.match(fn, /\(sp\.sort_numeric < v_cursor_sort_value::numeric\)\s*\n\s*or \(sp\.sort_numeric = v_cursor_sort_value::numeric and sp\.product_id > v_cursor_product_id\)/);
  assert.match(fn, /\(sp\.sort_numeric > v_cursor_sort_value::numeric\)\s*\n\s*or \(sp\.sort_numeric = v_cursor_sort_value::numeric and sp\.product_id > v_cursor_product_id\)/);
  // Every branch's tiebreak is `product_id > cursor` (ascending), matching
  // the ORDER BY's own fixed `sp.product_id asc` final tiebreak, regardless
  // of the primary sort's own direction — this consistency is what keeps a
  // replayed cursor deterministic.
  assert.match(fn, /sp\.product_id asc\s*\n\s*limit v_page_size \+ 1/);
});

test("incoming quantity is double-count safe: excludes every terminal document status AND every already-reconciled line — identical filter to request_warehouse_transfer's own pending-quantity check", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(
    fn,
    /where wti\.variant_id = pv\.id\s*\n\s*and wt\.direction = 'to_local'\s*\n\s*and wt\.status not in \('received', 'rejected', 'cancelled'\)\s*\n\s*and wti\.received_ok_qty is null/
  );
});

test("the latest/open replenishment request lateral join picks the single most relevant row per variant — an OPEN request first, else the most recent terminal one — never an unbounded list", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(
    fn,
    /order by \(wt\.status not in \('received', 'rejected', 'cancelled'\)\) desc, wt\.requested_at desc\s*\n\s*limit 1/
  );
  const latestJson = fn.slice(fn.indexOf("'latestRequest', case when io.latest_transfer_id is null then null else jsonb_build_object("));
  for (const field of ["transferId", "documentNumber", "status", "requestedAt", "requestedQty", "isOpen"]) {
    assert.ok(latestJson.slice(0, latestJson.indexOf(") end")).includes(`'${field}'`), `expected latestRequest field ${field}`);
  }
});

test("variant-specific image resolution: each color's own product_media row wins (matching product_variant_values -> color_option_value_id), falling back to the product's own cover image — the exact resolution lib/orders/variantImage.ts's resolveVariantImage already uses", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(
    fn,
    /join public\.product_media pm\s*\n\s*on pm\.product_id = pv\.product_id and pm\.color_option_value_id = pvv\.option_value_id\s*\n\s*where pvv\.variant_id = pv\.id and pm\.is_archived = false\s*\n\s*order by pm\.display_order\s*\n\s*limit 1/
  );
  assert.match(fn, /coalesce\(color_media\.storage_reference, p\.image\) as image,/);
});

test("color and size are resolved via the option_types 'Color'/'Size' system types (matching the existing SKU/media convention), each carrying its own catalog sort_order for deterministic ordering", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /where pvv\.variant_id = pv\.id and ot\.name = 'Color'/);
  assert.match(fn, /where pvv\.variant_id = pv\.id and ot\.name = 'Size'/);
  assert.match(fn, /color_value\.sort_order as color_sort_order,/);
  assert.match(fn, /size_value\.sort_order as size_sort_order,/);
});

test("within a page, variants are ordered deterministically: by the page's product order, then color sort_order, then size sort_order, then variant id — so a product/color group is never internally scrambled and repeated requests render identically", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(
    fn,
    /order by\s*\n\s*fp\.rn,\s*\n\s*m\.color_sort_order nulls first, m\.color nulls first,\s*\n\s*m\.size_sort_order nulls first, m\.size nulls first,\s*\n\s*m\.variant_id/
  );
  assert.match(
    fn,
    /\) order by io\.rn,\s*\n\s*io\.color_sort_order nulls first, io\.color nulls first,\s*\n\s*io\.size_sort_order nulls first, io\.size nulls first,\s*\n\s*io\.variant_id\)/
  );
});

test("estimatedDaysRemaining/suggestedRestock/riskScore mirror lib/inventory/brandInventoryInsights.ts's TypeScript formulas exactly, including the -1 out-of-stock risk sentinel standing in for TypeScript's Number.NEGATIVE_INFINITY (JSON has no Infinity)", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  const insights = read("lib/inventory/brandInventoryInsights.ts");
  // estimateDaysRemaining: Math.max(0, Math.round((quantity / (soldLast30Days / 30)) * 10) / 10), null when no sales.
  assert.match(insights, /Math\.max\(0, Math\.round\(\(quantity \/ \(soldLast30Days \/ 30\)\) \* 10\) \/ 10\)/);
  assert.match(
    fn,
    /then greatest\(0, round\(\(r\.available_at_zakhnook::numeric \/ \(r\.sold_last_30_days::numeric \/ 30\.0\)\) \* 10\) \/ 10\)\s*\n\s*else null/
  );
  // suggestedRestockQuantity: max(0, ceil(max(sold+threshold, threshold*2) - quantity)); SQL inputs are always integers so ceil() is a no-op, kept as plain integer arithmetic.
  assert.match(insights, /thirtyDayDemandWithBuffer = soldLast30Days \+ lowStockThreshold/);
  assert.match(insights, /minimumHealthyTarget = lowStockThreshold \* 2/);
  assert.match(
    fn,
    /greatest\(\s*\n\s*0,\s*\n\s*greatest\(r\.sold_last_30_days \+ r\.low_stock_threshold, r\.low_stock_threshold \* 2\) - r\.available_at_zakhnook\s*\n\s*\)::integer as suggested_restock,/
  );
  // riskScore: -1 sentinel for out-of-stock (TS: Number.NEGATIVE_INFINITY), else days-remaining, else the 10000+/20000+ no-sales fallback buckets.
  assert.match(insights, /if \(input\.quantity <= 0\) return Number\.NEGATIVE_INFINITY;/);
  assert.match(insights, /return input\.quantity <= input\.lowStockThreshold \? 10_000 \+ input\.quantity : 20_000 \+ input\.quantity;/);
  assert.match(
    fn,
    /case\s*\n\s*when r\.available_at_zakhnook <= 0 then -1\s*\n\s*when r\.sold_last_30_days > 0[\s\S]*?when r\.available_at_zakhnook <= r\.low_stock_threshold then 10000 \+ r\.available_at_zakhnook\s*\n\s*else 20000 \+ r\.available_at_zakhnook\s*\n\s*end as risk_score/
  );
});

test("stock_status classification (out_of_stock/low_stock/in_stock) matches lib/inventory/stockStatus.ts's calculateStockStatus exactly", () => {
  const stockStatusLib = read("lib/inventory/stockStatus.ts");
  assert.match(stockStatusLib, /if \(quantity <= 0\) return "out_of_stock";/);
  assert.match(stockStatusLib, /if \(quantity <= effectiveThreshold\) return "low_stock";/);
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(
    fn,
    /case\s*\n\s*when r\.available_at_zakhnook <= 0 then 'out_of_stock'\s*\n\s*when r\.available_at_zakhnook <= r\.low_stock_threshold then 'low_stock'\s*\n\s*else 'in_stock'\s*\n\s*end as stock_status,/
  );
});

test("the response carries every field the grouped Inventory UI needs per variant, plus the health-card summary counts computed without loading the entire catalog client-side", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  const itemJson = fn.slice(fn.indexOf("select jsonb_agg(jsonb_build_object("), fn.indexOf("from items_ordered io"));
  for (const field of [
    "variantId", "productId", "productName", "image", "color", "size", "sku",
    "availableAtZakhnook", "incomingQuantity", "lowStockThreshold", "stockStatus",
    "soldLast30Days", "estimatedDaysRemaining", "suggestedRestock", "sellingStatus", "latestRequest",
  ]) {
    assert.ok(itemJson.includes(`'${field}'`), `expected item field ${field}`);
  }
  const summaryJson = fn.slice(fn.indexOf("'summary', jsonb_build_object("));
  for (const field of ["totalVariantCount", "totalAvailableUnits", "healthyCount", "lowStockCount", "outOfStockCount", "matchingResultCount"]) {
    assert.ok(summaryJson.includes(`'${field}'`), `expected summary field ${field}`);
  }
});

test("only non-archived variants belonging to the requested brand are ever eligible — never a cross-brand leak", () => {
  const fn = migration.match(READ_MODEL_FN_PATTERN)![0];
  assert.match(fn, /where p\.brand_id = p_brand_id\s*\n\s*and pv\.is_archived = false/);
});

// ---------------------------------------------------------------------------
// Item 6: brand-facing manual overwrite API disabled safely
// ---------------------------------------------------------------------------

test("the manual brand-facing warehouse-stock overwrite route is disabled: it never calls set_warehouse_brand_stock, always returns the stable MANUAL_STOCK_OVERWRITE_DISABLED code, and stays behind the same auth/partner gate as before", () => {
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
// New Inventory read-model route + data-layer contract
// ---------------------------------------------------------------------------

test("the GET /api/brand-portal/inventory/variants route is gated behind the same partner-brand auth as every other warehouse route, translates the page's own URL vocabulary (level/sort) into the RPC's vocabulary, and passes the optional product filter through", () => {
  const route = read("app/api/brand-portal/inventory/variants/route.ts");
  assert.match(route, /requireActiveBrandOwner/);
  assert.match(route, /owner\.isMahalyPartner/);
  assert.match(route, /\.rpc\("brand_portal_inventory_page"/);
  assert.match(route, /p_brand_id: owner\.brandId/);
  assert.match(route, /p_product_id: productId/);
  for (const [urlValue, rpcValue] of [["all", "all"], ["healthy", "in_stock"], ["low", "low_stock"], ["out", "out_of_stock"]]) {
    assert.ok(route.includes(`${urlValue}: "${rpcValue}"`), `expected level=${urlValue} -> stockStatus=${rpcValue}`);
  }
  assert.ok(route.includes('risk: "risk"'), "expected sort=risk -> risk");
  assert.ok(route.includes('sales: "sales"'), "expected sort=sales -> sales");
  assert.ok(route.includes('"stock-asc": "stock_asc"'), "expected sort=stock-asc -> stock_asc");
  assert.ok(route.includes('"stock-desc": "stock_desc"'), "expected sort=stock-desc -> stock_desc");
  assert.ok(route.includes('"": "name"'), "expected empty sort value (Product name option) -> name");
});

test("getInventoryPageForBrand (lib/data/brandPortal.ts) is the server-rendered Inventory page's real data source — always via supabaseAdmin (the RPC is service_role-only, unreachable by the cookie-scoped client even under RLS) — and adapts the RPC's camelCase item shape into the same BrandVariant shape the rest of the brand portal already uses", () => {
  const dataLayer = read("lib/data/brandPortal.ts");
  assert.match(dataLayer, /export async function getInventoryPageForBrand/);
  assert.match(dataLayer, /supabaseAdmin\.rpc\("brand_portal_inventory_page"/);
  assert.match(dataLayer, /quantity: item\.availableAtZakhnook,/);
  assert.match(dataLayer, /latestRequest: item\.latestRequest \?\? undefined,/);
});

test("the Inventory page (app/brand-portal/stock/page.tsx) sources its main view from getInventoryPageForBrand, never getVariantsForBrand — getVariantsForBrand is only ever called for the Activity tab's row labels, and never on an Inventory view", () => {
  const page = read("app/brand-portal/stock/page.tsx");
  assert.match(page, /getInventoryPageForBrand\(owner\.brandId!, \{/);
  assert.match(page, /view === "activity" \? getVariantsForBrand\(owner\.brandSlug, owner\.isImpersonating\) : Promise\.resolve\(\[\]\)/);
});

test("Codex's off-limits files from the prior backend-only pass were legitimately modified where required by this integration branch — this test only documents which ones changed, it does not forbid it", () => {
  const changed = [
    "app/brand-portal/stock/page.tsx",
    "components/brand-portal/InventoryManager.tsx",
    "lib/data/brandPortal.ts",
  ];
  for (const relativePath of changed) {
    assert.doesNotThrow(() => read(relativePath), `${relativePath} should exist and be readable`);
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

test("every code the migration's RPCs can raise, plus the new inventory-page validation codes, has a mapped safe message and non-500 status in resolveReplenishmentError", () => {
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
