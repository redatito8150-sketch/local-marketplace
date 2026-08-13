import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}
function compact(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ").toLowerCase().replace(/\s+/g, "");
}

const LEDGER_PATH = "supabase/migrations/20260814000001_stock_ledger_locations.sql";
const ledgerMigration = read(LEDGER_PATH);
const ledgerSql = compact(ledgerMigration);

const DOCS_PATH = "supabase/migrations/20260814000003_warehouse_documents.sql";
const docsMigration = read(DOCS_PATH);
const docsSql = compact(docsMigration);

// ---------------------------------------------------------------------------
// Location-aware ledger (extends inventory_movements in place)
// ---------------------------------------------------------------------------

test("inventory_movements gains nullable from_location/to_location/related_entity_type/related_entity_id, never backfilled on historical rows", () => {
  assert.match(ledgerMigration, /add column if not exists from_location text,\s*\n\s*add column if not exists to_location text,\s*\n\s*add column if not exists related_entity_type text,\s*\n\s*add column if not exists related_entity_id uuid;/);
  assert.doesNotMatch(ledgerMigration, /update public\.inventory_movements set (from_location|to_location)/i);
});

test("from_location/to_location are constrained to the six-value location model", () => {
  for (const location of [
    "brand_location", "in_transit_to_zakhnook", "zakhnook_available",
    "zakhnook_quarantine", "returned_to_brand", "sold_or_removed",
  ]) {
    assert.ok(ledgerSql.includes(location), `expected location value ${location}`);
  }
  assert.ok(ledgerSql.includes("check(from_locationisnullorfrom_locationin("));
  assert.ok(ledgerSql.includes("check(to_locationisnullorto_locationin("));
});

test("movement_type is additively widened — every pre-existing value stays valid", () => {
  for (const value of [
    "opening_balance", "manual_adjustment", "order_placed", "order_cancelled",
    "return_restocked", "admin_correction", "legacy_opening_balance", "import",
    "other", "warehouse_transfer_received", "warehouse_return_reserved",
    "warehouse_return_released",
  ]) {
    assert.ok(ledgerSql.includes(value), `expected pre-existing movement_type ${value} to survive the widening`);
  }
  for (const value of [
    "warehouse_transfer_shipped", "warehouse_quarantine_hold",
    "warehouse_quarantine_release", "fulfillment_transition_snapshot",
  ]) {
    assert.ok(ledgerSql.includes(value), `expected new movement_type ${value}`);
  }
});

test("apply_warehouse_stock_correction requires a mandatory reason, is idempotent, never goes negative, and is tagged as a warehouse_correction in the ledger", () => {
  const fn = ledgerMigration.match(/create or replace function public\.apply_warehouse_stock_correction\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if p_delta = 0 then raise exception 'CORRECTION_DELTA_REQUIRED'; end if;/);
  assert.match(fn, /if nullif\(pg_catalog\.btrim\(p_reason\), ''\) is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;/);
  assert.match(fn, /if exists \(\s*\n\s*select 1 from public\.inventory_movements\s*\n\s*where variant_id = v_variant\.id and source_operation_key = p_operation_key\s*\n\s*\) then\s*\n\s*return jsonb_build_object\('variant_id', v_variant\.id, 'new_quantity', v_variant\.quantity, 'replayed', true\);/);
  assert.match(fn, /if v_new_quantity < 0 then raise exception 'CORRECTION_WOULD_GO_NEGATIVE'; end if;/);
  assert.match(fn, /'admin_correction', p_reason,/);
  assert.match(fn, /'warehouse_correction', v_variant\.id/);
  assert.ok(ledgerSql.includes("revokeallonfunctionpublic.apply_warehouse_stock_correction(uuid,uuid,integer,text,text,text)frompublic,anon,authenticated;"));
  assert.ok(ledgerSql.includes("grantexecuteonfunctionpublic.apply_warehouse_stock_correction(uuid,uuid,integer,text,text,text)toservice_role;"));
});

test("the new admin correction route requires a reason, requires an Idempotency-Key, and is gated by requireWarehouseReceiver()", () => {
  const route = read("app/api/admin/warehouse/corrections/route.ts");
  assert.match(route, /requireWarehouseReceiver\(\)/);
  assert.match(route, /A reason is required/);
  assert.match(route, /idempotency-key/i);
  assert.match(route, /\.rpc\("apply_warehouse_stock_correction"/);
});

// ---------------------------------------------------------------------------
// Warehouse documents — extends warehouse_transfers/warehouse_transfer_items
// in place, widens status to a union of old + new values, adds partial
// receiving.
// ---------------------------------------------------------------------------

test("warehouse_transfers gains document_number/document_type/has_discrepancy/approved_by/approved_at additively", () => {
  assert.match(docsMigration, /add column if not exists document_number text,\s*\n\s*add column if not exists document_type text,\s*\n\s*add column if not exists has_discrepancy boolean not null default false,/);
});

test("status CHECK is widened to the union of legacy and new values — no historical row needs rewriting", () => {
  const constraint = docsMigration.match(/alter table public\.warehouse_transfers add constraint warehouse_transfers_status_check\s*\n\s*check \(status in \(([\s\S]*?)\)\);/i)![1];
  for (const legacy of ["pending", "received", "rejected"]) {
    assert.ok(constraint.includes(`'${legacy}'`), `legacy status ${legacy} must remain valid`);
  }
  for (const fresh of ["draft", "submitted", "approved", "in_transit", "receiving", "partially_received", "cancelled"]) {
    assert.ok(constraint.includes(`'${fresh}'`), `new status ${fresh} must be present`);
  }
});

test("document numbers are generated by a dedicated sequential counter table (mirrors brand_sku_counters/next_product_sku), not the random-digit order_number style", () => {
  assert.match(docsMigration, /create table if not exists public\.warehouse_document_counters \(/);
  const fn = docsMigration.match(/create or replace function public\.next_warehouse_document_number\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /insert into public\.warehouse_document_counters \(direction, last_value\)\s*\n\s*values \(p_direction, 1\)\s*\n\s*on conflict \(direction\) do update\s*\n\s*set last_value = warehouse_document_counters\.last_value \+ 1/);
  assert.match(fn, /v_prefix := case when p_direction = 'to_local' then 'STN' else 'SRN' end;/);
});

test("item 1: request_warehouse_transfer no longer deadlocks a brand mid-cutover — allowed for an ordinary partner OR a brand_fulfilled brand with an open transition to zakhnook_fulfilled, and links the resulting document back to that transition", () => {
  const fn = docsMigration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /select id into v_open_transition_id\s*\n\s*from public\.brand_fulfillment_transitions\s*\n\s*where brand_id = p_brand_id and to_mode = 'zakhnook_fulfilled'\s*\n\s*and status not in \('completed', 'cancelled', 'failed'\)\s*\n\s*limit 1;/);
  assert.match(fn, /if not v_is_partner and v_open_transition_id is null then\s*\n\s*raise exception 'BRAND_NOT_PARTNER';\s*\n\s*end if;/);
  assert.match(fn, /document_number, document_type, related_fulfillment_transition_id\s*\n\s*\) values \(/);
  assert.match(fn, /p_operation_key, 'to_local', p_items, v_document_number, 'stock_transfer_note', v_open_transition_id/);
  // The brand is NEVER exposed as a partner anywhere else by this fix —
  // is_mahaly_partner/fulfillment_mode are untouched by this function.
  assert.doesNotMatch(fn, /is_mahaly_partner\s*=|fulfillment_mode\s*=/);
});

test("item 9: allocated-but-not-yet-reconciled quantity is computed across EVERY nonterminal document status (not just 'pending'), counting only unreconciled lines — prevents over-allocation once a document moves past 'pending'", () => {
  const transferFn = docsMigration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    transferFn,
    /where wti\.variant_id = v_variant\.id\s*\n\s*and wt\.direction = 'to_local'\s*\n\s*and wt\.status not in \('received', 'rejected', 'cancelled'\)\s*\n\s*and wti\.received_ok_qty is null;/
  );
  assert.doesNotMatch(transferFn, /and wt\.status = 'pending'\s*\n\s*and wt\.direction = 'to_local';/);
});

test("item 7: cancel_warehouse_document releases a reserved outbound return's stock exactly like reject_warehouse_document does, via the same shared helper — previously cancellation silently lost the reservation forever", () => {
  const cancelFn = docsMigration.match(/create or replace function public\.cancel_warehouse_document\([\s\S]*?end; \$\$;/i)![0];
  assert.match(cancelFn, /perform private\.release_reserved_outbound_stock\(\s*\n\s*p_transfer_id, p_actor_id, p_note, 'Local Warehouse Return Reservation Released \(document cancelled\)'\s*\n\s*\);/);

  const rejectFn = docsMigration.match(/create or replace function public\.reject_warehouse_document\([\s\S]*?\n\$\$;/i)![0];
  assert.match(rejectFn, /perform private\.release_reserved_outbound_stock\(\s*\n\s*p_transfer_id, p_actor_id, p_note, 'Local Warehouse Return Reservation Released'\s*\n\s*\);/);

  // The shared helper only releases NOT-yet-reconciled lines and is itself
  // locked down (unreachable except from these two callers, both owned by
  // the same definer role).
  const helperFn = docsMigration.match(/create or replace function private\.release_reserved_outbound_stock\([\s\S]*?\n\$\$;/i)![0];
  assert.match(helperFn, /where transfer_id = p_transfer_id and received_ok_qty is null/);
  assert.match(helperFn, /on conflict \(variant_id, source_operation_key\) do nothing;/);
  assert.ok(
    docsSql.includes("revokeallonfunctionprivate.release_reserved_outbound_stock(uuid,uuid,text,text)frompublic,anon,authenticated,service_role;")
  );
});

test("item 13: resolve_warehouse_quarantine exists (written_off/returned_to_brand/restored_to_sellable), requires a mandatory operation_key, is idempotent, and refuses to re-resolve an already-resolved line", () => {
  const fn = docsMigration.match(/create or replace function public\.resolve_warehouse_quarantine\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if p_resolution not in \('written_off', 'returned_to_brand', 'restored_to_sellable'\) then\s*\n\s*raise exception 'INVALID_QUARANTINE_RESOLUTION';\s*\n\s*end if;/);
  assert.match(fn, /if v_item\.quarantine_resolved_at is not null then raise exception 'QUARANTINE_ALREADY_RESOLVED'; end if;/);
  assert.match(fn, /if exists \(\s*\n\s*select 1 from public\.inventory_movements\s*\n\s*where variant_id = v_item\.variant_id and source_operation_key = p_operation_key\s*\n\s*\) then\s*\n\s*return jsonb_build_object\('transfer_item_id', v_item\.id, 'replayed', true\);/);
  assert.match(fn, /set quarantine_resolved_at = now\(\), quarantine_resolved_by = p_actor_id, quarantine_resolution = p_resolution/);
  assert.ok(docsSql.includes("revokeallonfunctionpublic.resolve_warehouse_quarantine(uuid,uuid,text,text,text)frompublic,anon,authenticated;"));
  assert.ok(docsSql.includes("grantexecuteonfunctionpublic.resolve_warehouse_quarantine(uuid,uuid,text,text,text)toservice_role;"));
});

test("warehouse_transfer_items gains quarantine_resolved_at/by/resolution, constrained to the three known resolutions", () => {
  assert.match(docsMigration, /add column if not exists quarantine_resolved_at timestamptz,\s*\n\s*add column if not exists quarantine_resolved_by uuid references auth\.users\(id\) on delete set null,\s*\n\s*add column if not exists quarantine_resolution text;/);
  assert.match(docsMigration, /check \(quarantine_resolution is null or quarantine_resolution in \('written_off', 'returned_to_brand', 'restored_to_sellable'\)\)/);
});

test("request_warehouse_transfer/request_warehouse_return stamp a document_number/document_type on every new row, additively, without changing their signatures", () => {
  const transferFn = docsMigration.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(transferFn, /v_document_number := public\.next_warehouse_document_number\('to_local'\);/);
  assert.match(transferFn, /document_number, document_type, related_fulfillment_transition_id\s*\n\s*\) values \(\s*\n\s*p_brand_id, p_actor_id, nullif\(pg_catalog\.btrim\(p_note\), ''\),\s*\n\s*p_operation_key, 'to_local', p_items, v_document_number, 'stock_transfer_note', v_open_transition_id/);

  const returnFn = docsMigration.match(/create or replace function public\.request_warehouse_return\([\s\S]*?\n\$\$;/i)![0];
  assert.match(returnFn, /v_document_number := public\.next_warehouse_document_number\('to_brand'\);/);
  assert.match(returnFn, /'to_brand', now\(\), p_items, v_document_number, 'stock_return_note'/);
});

test("private.receive_warehouse_document_canonical supports partial receiving: a subset of not-yet-reconciled lines resolves to 'partially_received' until every line is done, then 'received'", () => {
  const fn = docsMigration.match(/create or replace function private\.receive_warehouse_document_canonical\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /where wti\.transfer_id = p_transfer_id and wti\.received_ok_qty is null;/);
  assert.match(fn, /raise exception 'TRANSFER_ITEM_NOT_FOUND_OR_ALREADY_RECONCILED';/);
  assert.match(fn, /v_final_status := case when v_remaining_after = 0 then 'received' else 'partially_received' end;/);
  assert.match(fn, /select count\(\*\) into v_remaining_after\s*\n\s*from public\.warehouse_transfer_items\s*\n\s*where transfer_id = p_transfer_id and received_ok_qty is null;/);
});

test("reconciliation math (received_ok + damaged + missing = requested) is still enforced exactly, and damaged/missing still moves stock through in_transit/zakhnook_available correctly", () => {
  const fn = docsMigration.match(/create or replace function private\.receive_warehouse_document_canonical\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if v_ok \+ v_damaged \+ v_missing <> v_item_row\.requested_qty then\s*\n\s*raise exception 'TRANSFER_ITEM_NOT_RECONCILED';/);
  assert.match(fn, /if v_damaged > 0 or v_missing > 0 then v_has_discrepancy := true; end if;/);
});

test("has_discrepancy is a persistent flag — set true the moment any reconciled line (across however many partial calls) had damaged/missing, and this IS the required 'Discrepancy Report'", () => {
  const fn = docsMigration.match(/create or replace function private\.receive_warehouse_document_canonical\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /has_discrepancy = has_discrepancy or v_has_discrepancy,/);
});

test("only accepted good units ever increase sellable Zakhnook stock — receipt math is unchanged from the original canonical function for the quantity/brand_stock_quantity writes", () => {
  const fn = docsMigration.match(/create or replace function private\.receive_warehouse_document_canonical\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /v_new_quantity := v_variant\.quantity \+ v_ok;/);
  assert.match(fn, /v_new_brand_stock := v_variant\.brand_stock_quantity - v_item_row\.requested_qty;/);
});

test("old receive_warehouse_transfer/receive_warehouse_return wrappers keep their exact old signatures and now delegate to the new canonical function — Codex's existing UI calls keep working unchanged", () => {
  assert.match(docsMigration, /create or replace function public\.receive_warehouse_return\(\s*\n\s*p_transfer_id uuid, p_actor_id uuid, p_items jsonb, p_note text\s*\n\s*\) returns jsonb language sql security definer set search_path = '' as \$\$\s*\n\s*select private\.receive_warehouse_document_canonical\(p_transfer_id, p_actor_id, p_items, p_note, 'to_brand'\);/);
  assert.match(docsMigration, /create or replace function public\.receive_warehouse_transfer\(\s*\n\s*p_transfer_id uuid, p_actor_id uuid, p_items jsonb, p_note text\s*\n\s*\) returns jsonb language sql security definer set search_path = '' as \$\$\s*\n\s*select private\.receive_warehouse_document_canonical\(p_transfer_id, p_actor_id, p_items, p_note, 'to_local'\);/);
});

test("the new document status RPCs (submit/approve/in_transit/cancel/reject) exist with the expected pre-state gates", () => {
  assert.match(docsMigration, /if v_status <> 'draft' then raise exception 'DOCUMENT_NOT_DRAFT'; end if;/);
  assert.match(docsMigration, /if v_status not in \('pending', 'submitted'\) then raise exception 'DOCUMENT_NOT_SUBMITTED'; end if;/);
  assert.match(docsMigration, /if v_status not in \('pending', 'submitted', 'approved'\) then raise exception 'DOCUMENT_NOT_APPROVED'; end if;/);
  assert.match(docsMigration, /if v_status not in \('draft', 'pending', 'submitted', 'approved'\) then\s*\n\s*raise exception 'DOCUMENT_CANNOT_BE_CANCELLED_ONCE_IN_TRANSIT_OR_DECIDED';/);
});

test("every new/rewritten warehouse RPC is service_role-only", () => {
  for (const fn of [
    "request_warehouse_return(uuid, uuid, jsonb, text, text)",
    "request_warehouse_transfer(uuid, uuid, jsonb, text, text)",
    "receive_warehouse_return(uuid, uuid, jsonb, text)",
    "receive_warehouse_transfer(uuid, uuid, jsonb, text)",
    "receive_warehouse_document(uuid, uuid, jsonb, text, text)",
    "reject_warehouse_document(uuid, uuid, text)",
    "reject_warehouse_transfer(uuid, uuid, text)",
    "submit_warehouse_document(uuid, uuid)",
    "approve_warehouse_document(uuid, uuid)",
    "mark_warehouse_document_in_transit(uuid, uuid)",
    "cancel_warehouse_document(uuid, uuid, text)",
    "resolve_warehouse_quarantine(uuid, uuid, text, text, text)",
  ]) {
    const name = fn.split("(")[0];
    assert.ok(docsSql.includes(`revokeallonfunctionpublic.${name}`), `expected revoke on ${name}`);
    assert.ok(docsSql.includes(`grantexecuteonfunctionpublic.${name}`), `expected grant on ${name}`);
  }
  assert.ok(
    docsSql.includes("revokeallonfunctionprivate.receive_warehouse_document_canonical(uuid,uuid,jsonb,text,text)frompublic,anon,authenticated,service_role;")
  );
});

test("the new document-status admin routes are all gated by requireWarehouseReceiver()", () => {
  for (const routePath of [
    "app/api/admin/warehouse/documents/[id]/submit/route.ts",
    "app/api/admin/warehouse/documents/[id]/approve/route.ts",
    "app/api/admin/warehouse/documents/[id]/in-transit/route.ts",
    "app/api/admin/warehouse/documents/[id]/cancel/route.ts",
  ]) {
    const route = read(routePath);
    assert.match(route, /requireWarehouseReceiver\(\)/);
  }
});
