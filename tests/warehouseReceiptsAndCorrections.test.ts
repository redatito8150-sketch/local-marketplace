import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260817192829_warehouse_receipts_and_corrections.sql");
const privilegeHardening = read("supabase/migrations/20260817202810_harden_warehouse_document_table_privileges.sql");
const receiptExpressionHotfix = read("supabase/migrations/20260817204327_fix_warehouse_receipt_conditional_expressions.sql");
const closedIssueWorkflow = read("supabase/migrations/20260818003238_closed_document_issue_workflow.sql");

test("physical receipts are separate immutable facts with explicit expected and actual Variants", () => {
  assert.match(migration, /create table if not exists public\.warehouse_receipts/);
  assert.match(migration, /create table if not exists public\.warehouse_receipt_lines/);
  assert.match(migration, /expected_transfer_item_id uuid not null/);
  assert.match(migration, /expected_variant_id uuid not null/);
  assert.match(migration, /actual_variant_id uuid references/);
  assert.match(migration, /actual_good_qty integer not null/);
  assert.match(migration, /expected_missing_qty integer not null/);
  assert.match(migration, /actual_excess_qty integer not null/);
  assert.match(migration, /warehouse_receipt_lines_immutable/);
});

test("receipt v2 credits only the actual Variant and never treats missing units as physical quarantine", () => {
  const fn = migration.match(/create or replace function public\.receive_warehouse_document_v2\([\s\S]*?revoke all on function public\.receive_warehouse_document_v2/i)?.[0] ?? "";
  assert.match(fn, /if v_actual\.brand_id <> v_transfer\.brand_id then raise exception 'ACTUAL_VARIANT_BRAND_MISMATCH'/);
  assert.match(fn, /if v_actual\.is_archived or v_actual\.selling_status <> 'active'/);
  assert.match(fn, /v_new_quantity := v_actual\.quantity \+ v_good/);
  assert.match(fn, /where id = v_actual\.id/);
  assert.match(fn, /if v_damaged > 0 then[\s\S]*?'warehouse_quarantine_hold'/);
  assert.doesNotMatch(fn, /if v_missing > 0 then[\s\S]*?'warehouse_quarantine_hold'/);
  assert.match(fn, /when v_actual\.id is distinct from v_expected\.id then 'substitution'/);
});

test("receipt quantity bounds use PostgreSQL conditional expressions without invalid schema qualification", () => {
  assert.doesNotMatch(migration, /pg_catalog\.(?:greatest|least)\s*\(/i);
  assert.match(migration, /v_missing := greatest\(v_line\.requested_qty - v_physical, 0\)/);
  assert.match(migration, /v_legacy_good := least\(v_good, v_line\.requested_qty\)/);
  assert.match(receiptExpressionHotfix, /pg_catalog\.pg_get_functiondef\(v_signature\)/);
  assert.match(receiptExpressionHotfix, /'pg_catalog\.greatest\(',\s*'greatest\('/);
  assert.match(receiptExpressionHotfix, /'pg_catalog\.least\(',\s*'least\('/);
});

test("receipt and correction idempotency rejects conflicting payloads", () => {
  assert.match(migration, /payload_fingerprint text not null/g);
  assert.match(migration, /if v_receipt\.payload_fingerprint <> pg_catalog\.md5[\s\S]*?raise exception 'IDEMPOTENCY_CONFLICT'/);
  assert.match(migration, /if v_existing\.payload_fingerprint <> pg_catalog\.md5[\s\S]*?raise exception 'IDEMPOTENCY_CONFLICT'/);
  assert.match(migration, /pg_advisory_xact_lock/);
});

test("correction documents require independent approval and post stock legs atomically", () => {
  assert.match(migration, /create table if not exists public\.warehouse_corrections/);
  assert.match(migration, /create table if not exists public\.warehouse_correction_lines/);
  assert.match(migration, /approved_by is distinct from requested_by/);
  assert.match(migration, /if v_correction\.requested_by = p_approver_id then raise exception 'CORRECTION_REQUIRES_INDEPENDENT_APPROVER'/);
  assert.match(migration, /if v_from\.quantity < v_line\.quantity then raise exception 'CORRECTION_WOULD_GO_NEGATIVE'/);
  assert.match(migration, /'warehouse_reclassification_out'/);
  assert.match(migration, /'warehouse_reclassification_in'/);
  assert.match(migration, /order by pv\.id\s+for update/);
});

test("correction review supports documented rejection and safe append-only reversal", () => {
  const correction = read("components/admin/warehouse/WarehouseCorrectionWorkspace.tsx");
  const rejectRoute = read("app/api/admin/warehouse/corrections/[id]/reject/route.ts");
  const reverseRoute = read("app/api/admin/warehouse/corrections/[id]/reverse/route.ts");

  assert.match(migration, /create or replace function public\.reject_warehouse_correction/);
  assert.match(migration, /CORRECTION_REQUIRES_INDEPENDENT_REVIEWER/);
  assert.match(migration, /create or replace function public\.request_warehouse_correction_reversal/);
  assert.match(migration, /CORRECTION_CONTAINS_IRREVERSIBLE_PHYSICAL_ACTIONS/);
  assert.match(migration, /warehouse_corrections_one_active_reversal_idx/);
  assert.match(migration, /set status = 'reversed'\s+where id = v_correction\.reverses_correction_id/);
  assert.match(rejectRoute, /reject_warehouse_correction/);
  assert.match(reverseRoute, /request_warehouse_correction_reversal/);
  assert.match(reverseRoute, /Idempotency-Key/);
  assert.match(correction, /Confirm rejection/);
  assert.match(correction, /does not erase this document/);
});

test("discrepancy settlement is quantity-bounded and keeps missing separate from damaged", () => {
  assert.match(migration, /'damaged', 'missing', 'substitution', 'excess', 'unidentified'/);
  assert.match(migration, /CORRECTION_EXCEEDS_OPEN_DISCREPANCY_QUANTITY/);
  assert.match(migration, /where wrl\.id = \(v_line->>'source_receipt_line_id'\)::uuid\s+for update of wrl/);
  assert.match(migration, /INVALID_DAMAGED_STOCK_RESOLUTION/);
  assert.match(migration, /INVALID_MISSING_STOCK_RESOLUTION/);
  assert.match(migration, /DAMAGED_RESOLUTION_VARIANT_MISMATCH/);
  assert.match(migration, /MISSING_RECOVERY_VARIANT_MISMATCH/);
  assert.match(migration, /INVALID_SUBSTITUTION_RESOLUTION/);
  assert.match(migration, /INVALID_EXCESS_RESOLUTION/);
  assert.match(migration, /INVALID_UNIDENTIFIED_STOCK_RESOLUTION/);
  assert.match(migration, /'accept_discrepancy'/);
});

test("new tables are RLS protected and all writes stay service-role RPC only", () => {
  for (const table of ["warehouse_receipts", "warehouse_receipt_lines", "warehouse_corrections", "warehouse_correction_lines"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on public\.warehouse_receipts, public\.warehouse_receipt_lines,[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(privilegeHardening, /revoke all on public\.warehouse_receipts, public\.warehouse_receipt_lines,[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(privilegeHardening, /grant select on public\.warehouse_receipts, public\.warehouse_receipt_lines,[\s\S]*?to authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.receive_warehouse_document_v2[\s\S]*?to service_role/);
  assert.match(migration, /grant execute on function public\.request_warehouse_correction[\s\S]*?to service_role/);
  assert.match(migration, /grant execute on function public\.approve_warehouse_correction[\s\S]*?to service_role/);
  assert.match(migration, /grant execute on function public\.reject_warehouse_correction[\s\S]*?to service_role/);
  assert.match(migration, /grant execute on function public\.request_warehouse_correction_reversal[\s\S]*?to service_role/);
});

test("admin UX records actual Variants and never edits a closed receipt in place", () => {
  const receive = read("components/admin/warehouse/TransferReceiveForm.tsx");
  const correction = read("components/admin/warehouse/WarehouseCorrectionWorkspace.tsx");
  const detail = read("app/admin/warehouse/[id]/page.tsx");
  const receiptHistory = read("components/warehouse/WarehouseReceiptHistory.tsx");
  const receiveRoute = read("app/api/admin/warehouse/transfers/[id]/receive/route.ts");
  const approveRoute = read("app/api/admin/warehouse/corrections/[id]/approve/route.ts");

  assert.match(receive, /Document lines/);
  assert.doesNotMatch(receive, /Expected vs actual/);
  assert.match(receive, /Review receipt ·/);
  assert.match(receive, /Actually received Variant/);
  assert.match(receive, /Unidentified SKU — hold for mapping/);
  assert.match(receive, /Idempotency-Key/);
  assert.match(correction, /Original document: unchanged/);
  assert.match(correction, /Full Admin corrections apply immediately/);
  assert.match(detail, /WarehouseReceiptHistory/);
  assert.match(receiptHistory, /Physical receipts/);
  assert.match(detail, /WarehouseCorrectionWorkspace/);
  assert.match(receiveRoute, /receive_warehouse_document_v2/);
  assert.match(approveRoute, /requireAdminUser/);
  assert.match(approveRoute, /approve_warehouse_correction/);
});

test("closed documents report multiple inline Variant issues through one independently approved correction", () => {
  const correction = read("components/admin/warehouse/WarehouseCorrectionWorkspace.tsx");
  const warehouseData = read("lib/data/warehouse.ts");
  const requestRoute = read("app/api/admin/warehouse/corrections/route.ts");
  const approveRoute = read("app/api/admin/warehouse/corrections/[id]/approve/route.ts");

  assert.match(correction, /Report issue/);
  assert.match(correction, /Review corrections ·/);
  assert.match(correction, /drafts\.map\(\(draft\) => draft\.line\)/);
  assert.match(correction, /Wrong Variant/);
  assert.match(correction, /Wrong quantity/);
  assert.match(correction, /Condition changed/);
  assert.match(correction, /Document information/);
  assert.match(correction, /Original document: unchanged/);
  assert.match(requestRoute, /request_warehouse_correction_v2/);
  assert.match(approveRoute, /approve_warehouse_correction_v2/);
  assert.match(warehouseData, /new Set\(\["42703", "PGRST204"\]\)/);
  assert.match(warehouseData, /source_correction_line_id/);
});

test("closed-document corrections add bounded sellable holds and append-only document amendments", () => {
  assert.match(closedIssueWorkflow, /add column if not exists source_correction_line_id uuid/);
  assert.match(closedIssueWorkflow, /'move_to_hold'/);
  assert.match(closedIssueWorkflow, /'document_amendment'/);
  assert.match(closedIssueWorkflow, /CORRECTION_EXCEEDS_OPEN_SOURCE_QUANTITY/);
  assert.match(closedIssueWorkflow, /CORRECTION_EXCEEDS_OPEN_HOLD_QUANTITY/);
  assert.match(closedIssueWorkflow, /'zakhnook_available', 'zakhnook_quarantine'/);
  assert.match(closedIssueWorkflow, /CORRECTION_REQUIRES_INDEPENDENT_APPROVER/);
  assert.match(closedIssueWorkflow, /set search_path = ''/g);
  assert.match(closedIssueWorkflow, /revoke all on function public\.request_warehouse_correction_v2[\s\S]*?from public, anon, authenticated/);
  assert.match(closedIssueWorkflow, /grant execute on function public\.request_warehouse_correction_v2[\s\S]*?to service_role/);
  assert.match(closedIssueWorkflow, /revoke all on function private\.prepare_closed_document_issue_actions[\s\S]*?service_role/);
  assert.doesNotMatch(closedIssueWorkflow, /update public\.warehouse_receipt_lines\s+set\s+(?:actual_|expected_)/i);
});
