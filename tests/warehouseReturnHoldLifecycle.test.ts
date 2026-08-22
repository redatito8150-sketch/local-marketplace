import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compact = (value: string) => value.replace(/--[^\r\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();

test("outbound returns use hold and transit locations instead of claiming early brand delivery", () => {
  const migration = read("supabase/migrations/20260821214406_warehouse_return_hold_lifecycle.sql");
  const sql = compact(migration);

  for (const location of ["zakhnook_return_hold", "in_transit_to_brand", "brand_location"]) {
    assert.ok(sql.includes(`'${location}'`));
  }
  for (const movement of ["warehouse_return_reserved", "warehouse_return_released", "warehouse_return_dispatched", "warehouse_return_completed"]) {
    assert.ok(sql.includes(`'${movement}'`));
  }
  assert.ok(migration.includes("'''zakhnook_available'', ''zakhnook_return_hold''"));
  assert.match(migration, /'zakhnook_return_hold', 'in_transit_to_brand'/);
  assert.match(migration, /'in_transit_to_brand', 'brand_location'/);
  assert.ok(migration.includes("'''zakhnook_return_hold'', ''zakhnook_available''"));
});

test("acceptance is quantity-neutral, dispatch requires complete lines, and delivery confirmation requires dispatch", () => {
  const migration = read("supabase/migrations/20260821214406_warehouse_return_hold_lifecycle.sql");
  const acceptance = read("supabase/migrations/20260818202448_warehouse_owner_arrival_schedule.sql");
  const dispatch = migration.match(/create or replace function public\.dispatch_warehouse_return[\s\S]*?\n\$\$;/i)?.[0] ?? "";

  assert.doesNotMatch(acceptance.match(/create or replace function public\.accept_warehouse_document\([\s\S]*?\n\$\$;/i)?.[0] ?? "", /product_variants|inventory_movements/);
  assert.match(dispatch, /v_transfer\.status <> 'approved'/);
  assert.match(dispatch, /quantity_delta,[\s\S]*?v_variant\.quantity, 0, v_variant\.quantity/);
  assert.match(dispatch, /EVERY_DISPATCH_LINE_REQUIRED/);
  assert.match(dispatch, /DISPATCH_QUANTITY_MUST_MATCH_REQUEST/);
  assert.match(dispatch, /set dispatched_qty = v_qty/);
  assert.match(migration, /RETURN_MUST_BE_DISPATCHED_BEFORE_CONFIRMATION/);
  assert.match(migration, /p_expected_direction = 'to_brand'[\s\S]*?\('in_transit', 'partially_received'\)/);
});

test("returns can release their hold before dispatch but cannot be rejected after dispatch", () => {
  const migration = read("supabase/migrations/20260821214406_warehouse_return_hold_lifecycle.sql");
  const rejectRoute = read("app/api/admin/warehouse/transfers/[id]/reject/route.ts");

  assert.match(migration, /RETURN_CANNOT_BE_REJECTED_AFTER_DISPATCH/);
  assert.match(migration, /perform private\.release_reserved_outbound_stock/);
  assert.match(rejectRoute, /transfer\.direction === "to_brand" && transfer\.status === "in_transit"/);
  assert.match(rejectRoute, /cannot be rejected after it has been dispatched/);
  assert.match(migration, /create or replace function public\.cancel_own_requested_warehouse_document/);
  assert.match(migration, /Stock Return Note hold released after brand cancellation/);
});

test("open legacy dispatched returns remain completable after the explicit dispatch columns are introduced", () => {
  const migration = read("supabase/migrations/20260821214406_warehouse_return_hold_lifecycle.sql");

  assert.match(migration, /wt\.status in \('in_transit', 'partially_received'\)/);
  assert.match(migration, /wt\.stock_reserved_at is not null/);
  assert.match(migration, /set dispatched_qty = wti\.requested_qty/);
  assert.match(migration, /This is metadata-only/);
});

test("Admin, Brand Portal, inventory history, export, and notifications share the canonical return language", () => {
  const statusUi = read("components/admin/warehouse/warehouseUi.tsx");
  const adminPage = read("app/admin/warehouse/[id]/page.tsx");
  const brandPage = read("app/brand-portal/warehouse/[id]/page.tsx");
  const movementUi = read("lib/inventory/movementPresentation.ts");
  const exportRoute = read("app/api/admin/inventory/movements/export/route.ts");
  const dispatchRoute = read("app/api/admin/warehouse/documents/[id]/in-transit/route.ts");

  for (const label of ["Return requested", "Preparing return", "In transit to brand", "Returned to brand"]) {
    assert.ok(statusUi.includes(label));
  }
  assert.match(adminPage, /ReturnDispatchForm/);
  assert.match(adminPage, /Waiting for brand delivery confirmation/);
  assert.match(adminPage, /previewOnly showDispatchedQuantity/);
  assert.match(brandPage, /In transit to your brand/);
  assert.match(movementUi, /Return hold at Zakhnook/);
  assert.match(movementUi, /inventoryMovementRouteLabels/);
  assert.match(exportRoute, /inventoryMovementRouteLabels/);
  assert.match(dispatchRoute, /warehouse_return_dispatched/);
});

test("return lifecycle permissions preserve the role matrix", () => {
  const brandPage = read("app/brand-portal/warehouse/[id]/page.tsx");
  const adminDispatch = read("app/api/admin/warehouse/documents/[id]/in-transit/route.ts");
  const receive = read("app/api/admin/warehouse/transfers/[id]/receive/route.ts");
  const brandConfirm = read("app/api/brand-portal/warehouse/returns/[id]/confirm/route.ts");

  assert.match(brandPage, /owner\.accessLevel === "owner" && !owner\.isImpersonating/);
  assert.match(adminDispatch, /requireWarehouseReceiver\(\)/);
  assert.match(receive, /requireWarehouseReceiver\(\)/);
  assert.match(receive, /Only the Brand Owner can confirm delivery/);
  assert.match(brandConfirm, /requireActiveBrandOwner/);
  assert.match(brandConfirm, /owner\.accessLevel !== "owner" \|\| owner\.isImpersonating/);
  assert.match(brandConfirm, /confirm_warehouse_return_received/);
  assert.match(brandConfirm, /body\?\.arrived !== true/);
  assert.doesNotMatch(brandConfirm, /receivedOkQty|damagedQty|missingQty/);
  assert.doesNotMatch(brandPage, /DispatchWarehouseReturnButton/);
});

test("only binary Brand Owner arrival confirmation can complete a fully dispatched return", () => {
  const migration = read("supabase/migrations/20260821220827_simplify_brand_return_delivery_confirmation.sql");
  const confirm = migration.match(/create function public\.confirm_warehouse_return_received[\s\S]*?\n\$\$;/i)?.[0] ?? "";

  assert.match(confirm, /v_transfer\.brand_id <> p_brand_id/);
  assert.match(confirm, /v_transfer\.status <> 'in_transit'/);
  assert.match(confirm, /EVERY_RETURN_LINE_MUST_BE_DISPATCHED/);
  assert.match(confirm, /'received_ok_qty', wti\.dispatched_qty/);
  assert.match(confirm, /'damaged_qty', 0/);
  assert.match(confirm, /'missing_qty', 0/);
  assert.match(confirm, /private\.receive_warehouse_document_canonical/);
  assert.match(migration, /drop function public\.confirm_warehouse_return_received\(uuid, uuid, uuid, jsonb, text\)/);
  assert.match(migration, /grant execute on function public\.confirm_warehouse_return_received\(uuid, uuid, uuid, text\)[\s\S]*?to service_role/);
});

test("Brand Owner sees expected quantities, confirms arrival once, and can only add a document note", () => {
  const confirmation = read("components/brand-portal/warehouse/BrandReturnDeliveryConfirmation.tsx");
  const brandPage = read("app/brand-portal/warehouse/[id]/page.tsx");
  const adminPage = read("app/admin/warehouse/[id]/page.tsx");
  const documentLines = read("components/admin/warehouse/TransferReceiveForm.tsx");

  assert.match(confirmation, /I confirm that this shipment arrived/);
  assert.match(confirmation, /Confirm shipment received/);
  assert.match(confirmation, /item\.dispatchedQty \?\? item\.requestedQty/);
  assert.match(confirmation, /Explain any problem and the Zakhnook team will contact you/);
  assert.match(confirmation, /JSON\.stringify\(\{ arrived: true, note:/);
  assert.doesNotMatch(confirmation, /EditableQuantity|receivedOkQty|damagedQty|missingQty/);
  assert.match(brandPage, /<BrandReturnDeliveryConfirmation/);
  assert.doesNotMatch(brandPage, /confirmationRole="brand"/);
  assert.match(adminPage, /BrandDeliveryNoteReviewCard/);
  assert.match(brandPage, /Delivery confirmation note/);
  assert.match(brandPage, /const returnRequestPreview = transfer\.direction === "to_brand"/);
  assert.match(brandPage, /const requestOnlyPreview = returnRequestPreview \|\| transfer\.status === "cancelled"/);
  assert.match(brandPage, /requestOnlyPreview \? <TransferReceiveForm[\s\S]*?previewOnly/);
  assert.match(documentLines, /previewOnly && showDispatchedQuantity \? <StaticQuantity label="Returned" value=\{item\.dispatchedQty \?\? 0\}/);
  assert.match(documentLines, /\{previewOnly \? null : editable \? <EditableQuantity label=\{isReturn \? "Returned" : "Received"\}/);
});

test("cancelled stock transfer and return documents keep their original requested lines visible", () => {
  const adminPage = read("app/admin/warehouse/[id]/page.tsx");
  const brandPage = read("app/brand-portal/warehouse/[id]/page.tsx");

  assert.match(adminPage, /transfer\.status === "cancelled"/);
  assert.match(adminPage, /Cancelled request · historical document/);
  assert.match(adminPage, /every originally requested Variant and quantity remains visible below/);
  assert.match(adminPage, /isReturn=\{isReturn\} previewOnly/);
  assert.match(brandPage, /requestOnlyPreview/);
  assert.match(brandPage, /isReturn=\{transfer\.direction === "to_brand"\} previewOnly/);
});

test("Admin keeps the dispatched return quantity after shipment", () => {
  const workspace = read("components/admin/warehouse/WarehouseCorrectionWorkspace.tsx");
  const adminPage = read("app/admin/warehouse/[id]/page.tsx");

  assert.match(workspace, /isReturn \? item\.dispatchedQty \?\? item\.receivedOkQty \?\? 0/);
  assert.match(workspace, /label=\{isReturn \? "Returned" : "Received"\}/);
  assert.match(workspace, /\{isReturn \? "returned" : "accepted"\}/);
  assert.match(adminPage, /<WarehouseCorrectionWorkspace[\s\S]*?isReturn=\{isReturn\}/);
});

test("a Brand Owner delivery note creates an independent Admin follow-up without reopening the return", () => {
  const migration = read("supabase/migrations/20260821222256_brand_delivery_note_admin_review.sql");
  const confirmRoute = read("app/api/brand-portal/warehouse/returns/[id]/confirm/route.ts");
  const reviewRoute = read("app/api/admin/warehouse/documents/[id]/delivery-note-review/route.ts");
  const adminQueue = read("app/admin/warehouse/page.tsx");
  const reviewCard = read("components/admin/warehouse/BrandDeliveryNoteReviewCard.tsx");
  const brandPage = read("app/brand-portal/warehouse/[id]/page.tsx");
  const history = read("components/warehouse/WarehouseDocumentHistory.tsx");
  const sql = compact(migration);

  assert.match(migration, /brand_delivery_note_reviewed_at timestamptz/);
  assert.match(migration, /brand_delivery_note_reviewed_by uuid references auth\.users\(id\)/);
  assert.match(migration, /warehouse_transfers_pending_brand_delivery_note_review_idx/);
  assert.match(migration, /create or replace function public\.mark_brand_delivery_note_reviewed/);
  assert.match(migration, /v_transfer\.direction <> 'to_brand' or v_transfer\.status <> 'received'/);
  assert.match(migration, /BRAND_DELIVERY_NOTE_REQUIRED/);
  assert.match(migration, /set brand_delivery_note_reviewed_at = v_reviewed_at/);
  assert.doesNotMatch(migration.match(/create or replace function public\.mark_brand_delivery_note_reviewed[\s\S]*?\n\$\$;/i)?.[0] ?? "", /set status\s*=/i);
  assert.ok(sql.includes("revoke all on function public.mark_brand_delivery_note_reviewed(uuid, uuid) from public, anon, authenticated;"));
  assert.ok(sql.includes("grant execute on function public.mark_brand_delivery_note_reviewed(uuid, uuid) to service_role;"));

  assert.match(confirmRoute, /if \(note\)/);
  assert.match(confirmRoute, /warehouse_delivery_note_review/);
  assert.match(confirmRoute, /Needs review/);
  assert.match(reviewRoute, /requireWarehouseReceiver\(\)/);
  assert.match(reviewRoute, /mark_brand_delivery_note_reviewed/);
  assert.match(reviewRoute, /"Brand delivery note review": "Done"/);
  assert.match(adminQueue, /hasPendingBrandDeliveryNoteReview/);
  assert.match(reviewCard, /Mark as done/);
  assert.match(reviewCard, /The Stock Return Note stays Returned to brand/);
  assert.match(brandPage, /Zakhnook is reviewing/);
  assert.match(brandPage, /Reviewed by Zakhnook/);
  assert.match(history, /Brand note follow-up completed/);
});

test("Brand delivery confirmation is retry-safe and supports compatible open legacy returns", () => {
  const migration = read("supabase/migrations/20260821222256_brand_delivery_note_admin_review.sql");
  const confirmRoute = read("app/api/brand-portal/warehouse/returns/[id]/confirm/route.ts");
  const dispatchRoute = read("app/api/admin/warehouse/documents/[id]/in-transit/route.ts");
  const brandPage = read("app/brand-portal/warehouse/[id]/page.tsx");

  assert.match(migration, /v_transfer\.status = 'received'[\s\S]*?'replayed', true/);
  assert.match(migration, /v_transfer\.status not in \('in_transit', 'partially_received'\)/);
  assert.match(migration, /count\(\*\) filter \(where wti\.received_ok_qty is null\)/);
  assert.match(confirmRoute, /transfer\.status === "received"[\s\S]*?replayed: true/);
  assert.match(confirmRoute, /\["in_transit", "partially_received"\]\.includes\(transfer\.status\)/);
  assert.match(confirmRoute, /after\(async \(\) =>/);
  assert.match(dispatchRoute, /Review the expected units, then confirm when the shipment arrives/);
  assert.doesNotMatch(dispatchRoute, /complete every received, damaged and missing/);
  assert.match(brandPage, /\["in_transit", "partially_received"\]\.includes\(transfer\.status\)/);
});
