import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin Inventory is one sidebar branch with overview, stock requests, and Variant movements", () => {
  const sidebar = read("components/admin/AdminSidebar.tsx");
  const inventory = read("app/admin/inventory/page.tsx");
  const warehouse = read("app/admin/warehouse/page.tsx");

  for (const label of ["Inventory overview", "Stock requests", "Variant movements"]) {
    if (label === "Inventory overview") assert.match(sidebar, /label: "Inventory"/);
    else assert.match(sidebar, new RegExp(label));
  }
  assert.ok(sidebar.indexOf('label: "Inventory"') < sidebar.indexOf('label: "Stock requests"'));
  assert.ok(sidebar.indexOf('label: "Stock requests"') < sidebar.indexOf('label: "Variant movements"'));
  assert.doesNotMatch(inventory, /AdminWorkspaceNav/);
  assert.doesNotMatch(warehouse, /AdminWorkspaceNav/);
  assert.match(inventory, /type InventoryView = "catalog" \| "activity"/);
  assert.match(inventory, /getInventoryProductsForAdmin/);
  assert.match(inventory, /Monitor stock across every brand, product, color and size from one place/);
});

test("inventory data groups read-only stock by brands, products, colors, and sizes", () => {
  const data = read("lib/data/admin.ts");
  const start = data.indexOf("export async function getInventoryBrandSummariesForAdmin()");
  const end = data.indexOf("export async function getAuditLogsForEntity", start);
  const directory = start >= 0 && end > start ? data.slice(start, end) : "";

  assert.ok(directory);
  assert.match(directory, /from\("brands"\)/);
  assert.match(directory, /fulfillment_mode/);
  assert.match(directory, /getVariantsForProducts\(productIds, supabaseAdmin\)/);
  assert.match(directory, /calculateStockStatus/);
  assert.match(directory, /getInventoryProductsForAdmin/);
  assert.doesNotMatch(directory, /\.update\(|\.insert\(|\.delete\(/);
});

test("Inventory resolves the exact Variant image and uses Product to Color to Size disclosure", () => {
  const data = read("lib/data/admin.ts");
  const page = read("app/admin/inventory/page.tsx");

  assert.match(data, /from\("product_media"\)/);
  assert.match(data, /buildColorImageLookup\(mediaResult\.data \?\? \[\]\)/);
  assert.match(data, /image: resolveVariantImage\(product\.id, variant, colorImages, product\.image\)/);
  assert.match(data, /primaryColor: colorOption\?\.primaryColor/);
  assert.match(page, /<ColorSwatch swatchType=\{variant\.swatchType\}/);
  assert.match(data, /sizeSortOrder: sizeOption\?\.sortOrder/);
  assert.match(page, /compareSizeOrderables/);
  assert.match(page, /function groupProductColors/);
  assert.match(page, /function ProductCard/);
  assert.match(page, /function ColorInventoryGroup/);
  assert.match(page, /function VariantSizeRow/);
  assert.match(page, /color\.variants\[0\]\?\.image/);
  assert.match(page, /variant\.stockStatus/);
  assert.match(page, /Open a color to inspect its sizes and stock/);
});

test("expanded Admin inventory sizes distribute every metric across the available table width", () => {
  const page = read("app/admin/inventory/page.tsx");
  assert.match(page, /<col style=\{\{ width: "34%" \}\} \/>/);
  assert.match(page, /<col style=\{\{ width: "23%" \}\} \/>/);
  assert.match(page, /<th className="px-3 py-2 text-center">Available<\/th>/);
  assert.match(page, /font-extrabold tabular-nums/);
});

test("products and colors start collapsed and expose real brand and Variant identity", () => {
  const page = read("app/admin/inventory/page.tsx");

  assert.match(page, /product\.brandLogoImage \?/);
  assert.match(page, /<details className="group overflow-hidden/);
  assert.match(page, /<details className="group\/color overflow-hidden/);
  assert.doesNotMatch(page, /<details className="group overflow-hidden[^>]*\sopen=/);
  assert.doesNotMatch(page, /<details className="group\/color overflow-hidden[^>]*\sopen=/);
  assert.match(page, /group-open:rotate-90/);
  assert.match(page, /group-open\/color:rotate-90/);
});

test("catalog controls stay compact and make stock issues easy to scan", () => {
  const page = read("app/admin/inventory/page.tsx");

  assert.match(page, /Brand, product, color, size or SKU/);
  assert.match(page, /All fulfillment modes/);
  assert.match(page, /aria-label="Stock filters"/);
  assert.match(page, /All product states/);
  assert.match(page, /Issues only/);
  assert.match(page, /\["healthy", "Healthy", stockCounts\.in_stock, "bg-emerald-500"\]/);
  assert.match(page, /\["low_stock", "Low stock", stockCounts\.low_stock, "bg-amber-400"\]/);
  assert.match(page, /<StockBadge status=\{variant\.stockStatus\}/);
  assert.match(page, /need attention/);
  assert.match(page, /bg-white/);
  assert.doesNotMatch(page, /AdminInventoryCatalogTable/);
  assert.doesNotMatch(page, /Showing \{formatCount\(filtered\.length\)\}/);
  assert.match(page, /order-\[6\][^>]*>[\s\S]*More inventory filters/);
});

test("movement ledger is database-paginated and supports an exact Variant", () => {
  const data = read("lib/data/admin.ts");
  const page = read("app/admin/inventory/page.tsx");

  assert.match(data, /getInventoryMovementsForAdmin\(options: \{[\s\S]*?productId\?: string;[\s\S]*?variantId\?: string;[\s\S]*?brand\?: string;[\s\S]*?source\?: string;/);
  assert.match(data, /\.range\(from, to\)/);
  assert.match(data, /query\.eq\("variant_id", options\.variantId\)/);
  assert.match(data, /exactVariantIds = exactVariants\.length/);
  assert.match(data, /query\.in\("variant_id", exactVariantIds\)/);
  assert.match(data, /toLocaleLowerCase\("en-US"\) === normalizedQuery/);
  assert.match(page, /productId: selectedProduct\?\.id/);
  assert.match(page, /variantId: selectedVariant\?\.id/);
  assert.match(page, /<Select label="Variant" name="variantId"/);
  assert.match(page, /Immutable stock history · newest first/);
  assert.match(page, /formatDateTime\(row\.createdAt\)/);
});

test("movement rows present one compact operational story without stacked card fragments", () => {
  const page = read("app/admin/inventory/page.tsx");

  assert.match(page, /label="Balance & route"/);
  assert.match(page, /SortableTableHeader/);
  assert.match(page, /function MovementBalance/);
  assert.match(page, /function MovementEvent/);
  assert.match(page, /movementAccent\(row\.quantityDelta\)/);
  assert.match(page, /border-l-emerald-500/);
  assert.match(page, /aria-label=\{`Stock changed from/);
  assert.doesNotMatch(page, /function StockMovement/);
  assert.doesNotMatch(page, /function MovementChange/);
});

test("movement ledger exposes the complete warehouse vocabulary and operational context", () => {
  const page = read("app/admin/inventory/page.tsx");
  const data = read("lib/data/admin.ts");
  const presentation = read("lib/inventory/movementPresentation.ts");

  for (const value of [
    "warehouse_receipt",
    "warehouse_receipt_actual",
    "warehouse_quarantine_hold",
    "warehouse_quarantine_release",
    "warehouse_correction_adjustment",
    "warehouse_discrepancy_resolution",
  ]) assert.match(presentation, new RegExp(value));

  assert.match(data, /from_location, to_location, related_entity_type, related_entity_id/);
  assert.match(data, /created_by, source, source_operation_key/);
  assert.match(data, /from\("warehouse_receipts"\)/);
  assert.match(data, /from\("warehouse_corrections"\)/);
  assert.match(data, /from\("profiles"\)/);
  assert.match(page, /function MovementRoute/);
  assert.match(page, /function MovementReference/);
  assert.match(page, /No sellable change/);
  assert.match(page, /Test or legacy note/);
});

test("movement ledger can group by source document and export the filtered audit trail", () => {
  const page = read("app/admin/inventory/page.tsx");
  const exportRoute = read("app/api/admin/inventory/movements/export/route.ts");

  assert.match(page, /type ActivityMode = "movements" \| "documents"/);
  assert.match(page, /function groupMovements/);
  assert.match(page, /function DocumentMovementGroups/);
  assert.match(page, /Open source document/);
  assert.match(page, /Export CSV/);
  assert.match(exportRoute, /requireAdminUser\(\)/);
  assert.match(exportRoute, /getInventoryMovementsForAdmin/);
  assert.match(exportRoute, /Recorded By/);
  assert.match(exportRoute, /Actor Email/);
  assert.match(exportRoute, /Data Quality/);
  assert.match(exportRoute, /text\/csv/);
});

test("Inventory sidebar branch uses a connected thread treatment in expanded and collapsed navigation", () => {
  const sidebar = read("components/admin/AdminSidebar.tsx");

  assert.match(sidebar, /function InventoryBranch/);
  assert.match(sidebar, /aria-label="Inventory destinations"/);
  assert.match(sidebar, /aria-expanded=\{open\}/);
  assert.match(sidebar, /Collapse Inventory destinations/);
  assert.match(sidebar, /Expand Inventory destinations/);
  assert.match(sidebar, /bg-\[var\(--admin-border\)\]/);
  assert.match(sidebar, /absolute -left-7 top-1\/2 h-px w-5/);
  assert.match(sidebar, /searchParams\.get\("view"\) === "activity"/);
  assert.match(sidebar, /child\.badge \? counts\[child\.badge\]/);
  assert.match(sidebar, /branchItems\.map/);
});

test("advanced movement filters live in a compact progressive toolbar", () => {
  const page = read("app/admin/inventory/page.tsx");
  const autoSubmit = read("components/dashboard/AutoSubmitForm.tsx");

  assert.match(page, /<AutoSubmitForm action="\/admin\/inventory" className="relative">/);
  assert.match(page, /aria-label="Quick movement filters"/);
  assert.match(page, /aria-label="Choose date range"/);
  assert.match(page, /aria-label="More movement filters"/);
  assert.match(page, /const advancedFilterCount = \[params\.brand, params\.productId, params\.variantId, source, movementType\]\.filter\(Boolean\)\.length/);
  assert.match(page, /xl:max-w-\[330px\]/);
  assert.match(page, /absolute right-0 top-\[calc\(100%\+8px\)\]/);
  assert.match(page, /rounded-2xl border border-\[#e7ddd5\] bg-white p-4/);
  assert.match(page, /view === "catalog" \? <DashboardPageHeader/);
  assert.match(page, /\["receipt_posted", "Receipts", "bg-emerald-500"\]/);
  assert.match(page, /<Select label="Brand" name="brand"/);
  assert.doesNotMatch(page, /flex h-\[18px\].*advancedFilterCount/);
  assert.match(autoSubmit, /\["search", "text", "number"\]\.includes\(target\.type\)/);
  assert.match(autoSubmit, /form\.requestSubmit\(\)/);
  assert.doesNotMatch(page, /Apply date range/);
  assert.doesNotMatch(page, /More filters/);
  assert.doesNotMatch(page, /title=\{view === "activity"/);
  assert.doesNotMatch(page, /_140px_140px_120px_120px_auto/);
});

test("Stock requests uses consistent English copy and pinned English dates", () => {
  const warehouse = read("app/admin/warehouse/page.tsx");
  const detail = read("app/admin/warehouse/[id]/page.tsx");
  const documentHeader = read("components/warehouse/WarehouseDocumentHeader.tsx");
  const history = read("components/warehouse/WarehouseDocumentHistory.tsx");

  assert.match(warehouse, />Stock requests<\/h1>/);
  assert.doesNotMatch(warehouse, /اذن صرف مخزن/);
  assert.match(warehouse, /formatDateTime\(transfer\.requestedAt\)/);
  assert.match(detail, /WarehouseDocumentHeader/);
  assert.match(documentHeader, /formatDateTime\(transfer\.requestedAt\)/);
  assert.match(history, /timestamp: transfer\.decidedAt/);
  assert.match(history, /formatDateTime\(entry\.timestamp\)/);
  assert.doesNotMatch(warehouse, /toLocaleString\(\)/);
  assert.doesNotMatch(detail, /toLocaleString\(\)/);
  assert.doesNotMatch(documentHeader, /toLocaleString\(\)/);
  assert.doesNotMatch(history, /toLocaleString\(\)/);
});
