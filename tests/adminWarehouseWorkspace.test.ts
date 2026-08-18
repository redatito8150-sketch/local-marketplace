import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("warehouse data exposes formal documents, every lifecycle state, exact Variant images, and quarantine state", () => {
  const data = read("lib/data/warehouse.ts");
  for (const status of ["draft", "pending", "submitted", "approved", "in_transit", "receiving", "partially_received", "received", "rejected", "cancelled"]) {
    assert.match(data, new RegExp(`\\| "${status}"|\\b${status}:`));
  }
  assert.match(data, /document_number, document_type, has_discrepancy/);
  assert.match(data, /quarantine_resolved_at, quarantine_resolution/);
  assert.match(data, /buildColorImageLookup/);
  assert.match(data, /resolveVariantImage/);
  assert.match(data, /brands\(name, slug, logo_image\)/);
  assert.match(data, /Promise\.all\(\[\s*emailFor\(t\.requested_by/);
});

test("Stock requests is a searchable, paginated operational queue with stable global summary actions", () => {
  const page = read("app/admin/warehouse/page.tsx");
  assert.match(page, /Document, brand, product or SKU/);
  assert.match(page, /Needs review/);
  assert.match(page, /All open stages/);
  assert.match(page, /Open discrepancies/);
  assert.match(page, /Resolved discrepancies/);
  assert.match(page, /Requested from/);
  assert.match(page, /Requested to/);
  assert.match(page, /const PAGE_SIZE = 12/);
  assert.match(page, /Warehouse document pages/);
  assert.match(page, /transfer\.documentNumber/);
  assert.match(page, /BrandMark/);
  assert.match(page, /allTransfers\.filter\(\(transfer\) => ACTION_REQUIRED_WAREHOUSE_STATUSES/);
  assert.equal((page.match(/suppressHydrationWarning/g) ?? []).length, 9);
  assert.match(page, /<input suppressHydrationWarning name="q"/);
  assert.match(page, /<select suppressHydrationWarning name="status"/);
});

test("warehouse details show one combined document history, printing, partial receipt, and discrepancy resolution", () => {
  const page = read("app/admin/warehouse/[id]/page.tsx");
  const history = read("components/warehouse/WarehouseDocumentHistory.tsx");
  const receive = read("components/admin/warehouse/TransferReceiveForm.tsx");
  const resolution = read("components/admin/warehouse/QuarantineResolutionForm.tsx");

  assert.match(page, /DocumentHistory/);
  assert.doesNotMatch(page, /function LifecycleTimeline/);
  assert.doesNotMatch(page, /function MetadataCard/);
  assert.doesNotMatch(page, /function AuditTrail/);
  assert.match(history, /Request, outcome and audit trail/);
  assert.doesNotMatch(page, /DocumentFact/);
  assert.doesNotMatch(page, /Document totals/);
  assert.doesNotMatch(history, /label: "Review"/);
  assert.doesNotMatch(history, /label: "Approved"/);
  assert.doesNotMatch(history, /label: "In transit"/);
  assert.match(history, /transfer\.status === "received" \? "Accepted"/);
  assert.match(history, /activity\.sort/);
  assert.doesNotMatch(page, /AdminWorkspaceNav/);
  assert.match(page, /text-\[9\.5px\][^>]*>[\s\S]*?<ArrowLeft[^>]*>[\s\S]*?All requests[\s\S]*?<div className="flex flex-col gap-4 lg:flex-row lg:items-center">[\s\S]*?<BrandMark/);
  assert.doesNotMatch(page, /All requests<\/Link>\s*<BrandMark/);
  assert.match(page, /getAuditLogsForEntity\("warehouse_transfer"/);
  assert.match(page, /PrintWarehouseDocumentButton/);
  assert.doesNotMatch(page, /WarehouseDocumentActions/);
  assert.doesNotMatch(page, /DocumentItems/);
  assert.match(receive, /QuarantineResolutionForm/);
  assert.match(receive, /item\.itemNote/);
  assert.match(receive, /Document lines/);
  assert.match(receive, /Every Variant and its reconciliation result/);
  assert.match(receive, /formatCount\(items\.length\).*variants.*formatCount\(totalRequested\).*units/);
  assert.match(receive, /formatCount\(totalAccepted\).*accepted so far/);
  assert.doesNotMatch(receive, /Expected vs actual/);
  assert.doesNotMatch(receive, /Record what physically arrived/);
  assert.match(receive, /EditableQuantity label=\{isReturn \? "Returned" : "Received"\}/);
  assert.match(receive, /EditableQuantity label="Damaged"/);
  assert.match(receive, /EditableQuantity label="Missing"/);
  assert.match(receive, /Review receipt ·/);
  assert.match(receive, /issueOpen/);
  assert.match(receive, /Actually received Variant/);
  assert.match(receive, /Substitution/);
  assert.match(page, /transfer\.status === "received"[\s\S]*?<WarehouseCorrectionWorkspace/);
  assert.match(page, /showLedger=\{\["partially_received", "rejected"\]\.includes\(transfer\.status\)\}/);
  assert.match(receive, /\{showLedger \? <Link[\s\S]*?>Ledger<\/Link> : null\}/);
  assert.match(receive, /Final receipt review/);
  assert.match(receive, /Idempotency-Key/);
  assert.match(receive, /new Set\(\)/);
  assert.match(resolution, /Idempotency-Key/);
  assert.match(resolution, /written_off/);
  assert.match(resolution, /returned_to_brand/);
  assert.match(resolution, /restored_to_sellable/);
});

test("partial receiving API accepts only unreconciled submitted lines and uses the canonical document RPC", () => {
  const route = read("app/api/admin/warehouse/transfers/[id]/receive/route.ts");
  assert.match(route, /RECEIVABLE_STATUSES/);
  assert.match(route, /"pending", "submitted", "approved", "in_transit", "partially_received"/);
  assert.match(route, /\.in\("id", submittedIds\)/);
  assert.match(route, /item\.received_ok_qty == null/);
  assert.match(route, /receive_warehouse_document_v2/);
  assert.match(route, /receive_warehouse_document/);
  assert.match(route, /p_operation_key: operationKey/);
  assert.match(route, /supabaseAdmin\.rpc\(rpcName/);
  assert.match(route, /p_direction: transfer\.direction/);
  assert.match(route, /documentResult\.items/);
  assert.match(route, /documentResult\.status === "partially_received"/);
  assert.doesNotMatch(route, /expectedIds\.size !== submittedIds\.length \|\|\s*submittedIds\.some[\s\S]*Every transfer item must be reconciled exactly once/);
});

test("rejection and cancellation require an audit reason at route boundaries", () => {
  const reject = read("app/api/admin/warehouse/transfers/[id]/reject/route.ts");
  const cancel = read("app/api/admin/warehouse/documents/[id]/cancel/route.ts");
  assert.match(reject, /A rejection reason is required/);
  assert.match(reject, /reject_warehouse_document/);
  assert.match(cancel, /A cancellation reason is required/);
});
