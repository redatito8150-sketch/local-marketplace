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
  assert.match(data, /Promise\.all\(\[\s*actorIdentityFor\(t\.requested_by/);
});

test("Stock requests is a compact searchable queue with inline status, brand and date filters", () => {
  const page = read("app/admin/warehouse/page.tsx");
  const filters = read("components/admin/warehouse/WarehouseQueueFilters.tsx");
  const dateRange = read("components/brand-portal/DateRangePicker.tsx");
  const data = read("lib/data/warehouse.ts");
  assert.match(filters, /Search document, brand, product or SKU/);
  assert.match(filters, /Requested date range/);
  assert.match(filters, /compact/);
  assert.match(filters, /All brands/);
  assert.match(filters, /value: "requested", label: "Requested"/);
  assert.match(filters, /value: "approved", label: "Awaiting arrival"/);
  assert.match(filters, /value: "action_required", label: "Needs review"/);
  assert.match(filters, /filter\.value === "action_required" && needsReviewCount > 0/);
  assert.match(filters, /value: "received", label: "Received"/);
  assert.match(dateRange, /compact\?: boolean/);
  assert.match(dateRange, /compact && \(from \|\| to\).*Clear/);
  assert.match(page, /Needs review/);
  assert.match(page, /const needsReviewCount = allTransfers\.filter/);
  assert.doesNotMatch(page, />\{formatCount\(openDiscrepancies\.length\)\} unresolved<\/Link>/);
  assert.match(page, /Document \/ brand/);
  assert.match(page, /Created/);
  assert.match(page, /Updated/);
  assert.match(page, /railClass/);
  assert.match(page, /statusLabel/);
  assert.match(page, /const issuePriority = Number\(hasOpenWarehouseIssue\(b\)\) - Number\(hasOpenWarehouseIssue\(a\)\)/);
  assert.doesNotMatch(page, /SummaryLink/);
  assert.doesNotMatch(page, /WarehouseFilters/);
  assert.match(page, /const PAGE_SIZE = 12/);
  assert.match(page, /Warehouse document pages/);
  assert.match(page, /transfer\.documentNumber/);
  assert.match(page, /text-\[12px\][^>]*>\{documentNumber\}<\/p><p[^>]*text-\[10px\][^>]*>\{transfer\.brandName\}<\/p>/);
  assert.match(page, /BrandMark/);
  assert.match(page, /ACTION_REQUIRED_WAREHOUSE_STATUSES\.has\(transfer\.status\) && !hasOpenDiscrepancy/);
  assert.match(page, /transfer\.reconciliationStatus === "open_discrepancy"/);
  assert.match(page, /transfer\.status === "received" && transfer\.reconciliationStatus === "corrected"/);
  assert.match(page, />Corrected<\/span>/);
  assert.match(data, /warehouse_receipts\(id\)/);
  assert.doesNotMatch(page, /suppressHydrationWarning/);
});

test("warehouse details show one combined document history, printing, partial receipt, and discrepancy resolution", () => {
  const page = read("app/admin/warehouse/[id]/page.tsx");
  const documentHeader = read("components/warehouse/WarehouseDocumentHeader.tsx");
  const history = read("components/warehouse/WarehouseDocumentHistory.tsx");
  const receive = read("components/admin/warehouse/TransferReceiveForm.tsx");
  const resolution = read("components/admin/warehouse/QuarantineResolutionForm.tsx");

  assert.match(page, /DocumentHistory/);
  assert.doesNotMatch(page, /function LifecycleTimeline/);
  assert.doesNotMatch(page, /function MetadataCard/);
  assert.doesNotMatch(page, /function AuditTrail/);
  assert.match(history, /Request, outcome and audit trail/);
  assert.match(history, /border border-\[#e6ded7\] bg-white/);
  assert.doesNotMatch(page, /DocumentFact/);
  assert.doesNotMatch(page, /Document totals/);
  assert.doesNotMatch(history, /label: "Review"/);
  assert.doesNotMatch(history, /label: "Approved"/);
  assert.doesNotMatch(history, /label: "In transit"/);
  assert.match(history, /transfer\.status === "received" \? "Received"/);
  assert.match(history, /activity\.sort/);
  assert.doesNotMatch(page, /AdminWorkspaceNav/);
  assert.match(page, /<WarehouseDocumentHeader[^>]*backLabel="All requests"/);
  assert.match(documentHeader, /<BrandMark/);
  assert.match(documentHeader, /border border-\[#e6ded7\] bg-white/);
  assert.match(documentHeader, />Corrected<\/span>/);
  assert.match(documentHeader, /Expected arrival/);
  assert.doesNotMatch(page, />Open brand</);
  assert.match(page, /getAuditLogsForEntity\("warehouse_transfer"/);
  assert.match(page, /PrintWarehouseDocumentButton/);
  assert.match(page, /WarehouseReceiptHistory/);
  assert.doesNotMatch(page, /WarehouseDocumentActions/);
  assert.doesNotMatch(page, /DocumentItems/);
  assert.match(receive, /QuarantineResolutionForm/);
  assert.match(receive, /item\.itemNote/);
  assert.match(receive, /Document lines/);
  assert.match(receive, /border border-\[#e6ded7\] bg-white/);
  assert.match(read("components/admin/warehouse/WarehouseCorrectionWorkspace.tsx"), /border border-\[#e6ded7\] bg-white/);
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
  for (const surface of [receive, resolution, read("components/admin/warehouse/WarehouseCorrectionWorkspace.tsx")]) {
    assert.doesNotMatch(surface, /bg-\[#242424\]|hover:bg-\[#242424\]|bg-amber-800|hover:bg-amber-900/);
  }
});

test("partial receiving API accepts only unreconciled submitted lines and uses the canonical document RPC", () => {
  const route = read("app/api/admin/warehouse/transfers/[id]/receive/route.ts");
  assert.match(route, /RECEIVABLE_STATUSES/);
  assert.match(route, /"approved", "in_transit", "partially_received"/);
  assert.doesNotMatch(route, /"pending", "submitted", "approved"/);
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
