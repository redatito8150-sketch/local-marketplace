import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("partner stock actions sit in the Variant stock table header and create warehouse documents without changing live stock early", () => {
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  assert.match(inventory, />Add stock</);
  assert.match(inventory, />Return stock</);
  assert.match(inventory, /Variant stock[\s\S]*aria-label="Inventory stock actions"/);
  assert.match(inventory, /\{canRequestRestock && <div aria-label="Inventory stock actions"/);
  assert.doesNotMatch(inventory, /<section aria-label="Inventory stock actions"/);
  assert.doesNotMatch(inventory, />Stock actions</);
  assert.match(inventory, /<ReturnRequestDrawer/);
  assert.match(inventory, /\/api\/brand-portal\/warehouse\/transfers/);
  assert.match(inventory, /"Idempotency-Key": restockOperationKey\.current/);
  assert.match(inventory, /type="datetime-local"/);
  assert.match(inventory, /accessLevel === "owner"/);
  assert.match(inventory, /expectedArrivalAt: new Date\(restockExpectedArrival\)\.toISOString\(\)/);
  assert.match(inventory, /Available stock will not change until Zakhnook receives/);
  assert.doesNotMatch(inventory, /href=\{shipmentHref/);
});

test("each selected Variant can be removed directly from the compact selection tray", () => {
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  assert.match(inventory, /function SelectedVariantChips/);
  assert.match(inventory, /aria-label=\{`Remove \$\{variant\.sku\} from selection`\}/);
  assert.match(inventory, /delete next\[variantId\]/);
  assert.match(inventory, /setConfirming\(false\)/);
  assert.equal(
    (inventory.match(/<SelectedVariantChips variants=\{selectedRows\} onRemove=\{removeSelectedVariant\} \/>/g) ?? []).length,
    2,
    "partner restock and direct-brand adjustment should expose the same per-Variant removal control",
  );
});

test("partner inventory distinguishes available and incoming quantities", () => {
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  const data = read("lib/data/brandPortal.ts");
  assert.match(inventory, /label="Incoming"/);
  assert.match(inventory, /variant\.incomingQuantity/);
  assert.match(data, /warehouse_transfer_items/);
  assert.match(data, /"pending", "submitted", "approved", "in_transit", "receiving", "partially_received"/);
});

test("variant stock is grouped by product, then color, with group selection", () => {
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  assert.match(inventory, /function buildVariantGroups/);
  assert.match(inventory, /product\.colors\.values\(\)/);
  assert.match(inventory, /openProduct\(group: ProductVariantGroup\)/);
  assert.match(inventory, /openColor\(group: ColorVariantGroup\)/);
  // CORRECTIVE PASS: the collapsed product row now shows the product's own
  // designated cover photo (productImage), not the first-sorted color's
  // own photo — VariantImage takes explicit image/alt props instead of a
  // whole variant object, so a color's own photo is still exactly what the
  // per-color row (this assertion) renders.
  assert.match(inventory, /<VariantImage image=\{color\.variants\[0\]\.image\}/);
  assert.match(inventory, /<VariantImage image=\{product\.productImage\}/);
  assert.match(inventory, /onToggleVariants\(product\.variants\.map/);
  assert.match(inventory, /onToggleVariants\(color\.variants\.map/);
  assert.doesNotMatch(inventory, /if \(!open\) onToggleVariants/);
});

test("Brand Portal inventory mirrors Admin size order, color swatches, white surfaces, and aligned metric columns", () => {
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  const data = read("lib/data/brandPortal.ts");
  assert.match(inventory, /import ColorSwatch from "@\/components\/admin\/ColorSwatch"/);
  assert.match(inventory, /compareSizeOrderables/);
  assert.match(inventory, /primaryColor=\{variant\.primaryColor\}/);
  assert.match(inventory, /table-fixed/);
  assert.match(inventory, /<colgroup>/);
  assert.match(inventory, /canSelect \? "32%" : "36%"/);
  assert.match(inventory, /isMahalyPartner \? "22%" : "20%"/);
  assert.doesNotMatch(inventory, /label="Stock cover"/);
  assert.doesNotMatch(inventory, /function StockInsight/);
  assert.match(inventory, /function AggregateCell[\s\S]*text-center/);
  assert.match(data, /sizeSortOrder\?: number/);
  assert.match(data, /sizeBrandId\?: string \| null/);
  assert.match(data, /getVariantsForProducts\([\s\S]*supabaseAdmin/);
  assert.match(data, /primaryColor: colorValue\?\.primaryColor/);
});

test("Brand Portal groups Inventory, Stock Transfers, and Variant movements in the sidebar instead of an in-page switcher", () => {
  const navigation = read("components/brand-portal/BrandPortalNav.tsx");
  const stockPage = read("app/brand-portal/stock/page.tsx");
  const warehouse = read("components/brand-portal/warehouse/WarehouseExperience.tsx");
  for (const label of ["Inventory", "Stock Transfers", "Variant movements"]) assert.match(navigation, new RegExp(label));
  assert.match(navigation, /aria-label="Inventory destinations"/);
  assert.match(navigation, /Collapse Inventory destinations/);
  assert.match(navigation, /Expand Inventory destinations/);
  assert.match(navigation, /showWarehouse \? \[\{ label: "Stock Transfers"/);
  assert.match(navigation, /withBrandHref\(child\.href, brand\)/);
  assert.doesNotMatch(stockPage, /aria-label="Inventory views"/);
  assert.match(stockPage, /title=\{view === "activity" \? "Variant movements" : "Inventory"\}/);
  assert.match(warehouse, />Stock Transfers<\/h1>/);
});

test("Brand Portal Variant movements mirrors Admin ledger clarity without exposing Admin-only controls", () => {
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  const data = read("lib/data/brandPortal.ts");
  const ordersPage = read("app/brand-portal/orders/page.tsx");
  const ordersWorkspace = read("components/brand-portal/BrandOrdersWorkspace.tsx");

  assert.match(inventory, /inventoryMovementLabel, inventorySourceLabel, movementTone/);
  assert.match(inventory, /aria-label="Movement direction"/);
  for (const label of ["Stock in", "Stock out", "No change"]) assert.match(inventory, new RegExp(label));
  assert.match(inventory, />Movement ledger</);
  assert.match(inventory, /<MovementVariant variant=\{variant\} movement=\{movement\}/);
  assert.match(inventory, /<MovementBalance movement=\{movement\}/);
  assert.match(inventory, /<MovementEvent movement=\{movement\}/);
  assert.match(inventory, /movementAccent\(movement\.quantityDelta\)/);
  assert.match(inventory, /type="date" value=\{activityFrom\}/);
  assert.match(inventory, /type="date" value=\{activityTo\}/);
  assert.match(inventory, /<MovementReference movement=\{movement\}/);
  assert.match(inventory, /<MovementRecorded movement=\{movement\}/);
  assert.match(inventory, /movement\.reference\.label/);
  assert.match(inventory, /movement\.actor\.displayName/);
  assert.match(data, /created_by, source, source_operation_key, related_entity_type, related_entity_id/);
  assert.match(data, /href: `\/brand-portal\/warehouse\/\$\{document\.id\}`/);
  assert.match(data, /href: `\/brand-portal\/orders\?order=\$\{encodeURIComponent/);
  assert.match(data, /\.eq\("brand_id", brandId\)/);
  assert.match(data, /\.eq\("order_items\.brand_slug", movementBrand\?\.slug/);
  assert.match(data, /isStaff[\s\S]*?"Zakhnook Staff Team"/);
  assert.match(data, /accessLevel === "owner"[\s\S]*?"Brand owner"/);
  assert.match(data, /accessLevel === "assistant"[\s\S]*?"Brand assistant"/);
  assert.match(inventory, /impersonatingBrandSlug[\s\S]*?brand=\$\{encodeURIComponent/);
  assert.match(ordersPage, /params\.order \? allOrders\.find\(\(order\) => order\.id === params\.order\)/);
  assert.match(ordersWorkspace, /useState<BrandOrder \| null>\(initialSelectedOrder\)/);
  assert.doesNotMatch(inventory, /All brands|Admin correction|Historical migration/);
  assert.doesNotMatch(data, /href: `\/admin\/(?:warehouse|orders)/);
});

test("large inventories render in bounded pages — Inventory pagination happens in Postgres and the return drawer paginates product groups", () => {
  const page = read("app/brand-portal/stock/page.tsx");
  const warehouse = read("components/brand-portal/warehouse/WarehouseExperience.tsx");
  const dataLayer = read("lib/data/brandPortal.ts");

  // The Inventory page no longer loads a brand's full catalog or slices it
  // client-side — it calls the paginated read model and only ever holds one
  // page's worth of variants in memory.
  assert.doesNotMatch(page, /getVariantsForBrand\(owner\.brandSlug, owner\.isImpersonating\),\s*\n\s*getInventoryHistoryForBrand/);
  assert.match(page, /getInventoryPageForBrand\(owner\.brandId!, \{/);
  assert.match(page, /cursor: params\.cursor \?\? null/);
  assert.doesNotMatch(page, /\.slice\(\(currentPage - 1\)/);
  assert.match(dataLayer, /export async function getInventoryPageForBrand/);
  assert.match(dataLayer, /brand_portal_inventory_page/);

  // The return drawer keeps its already-small active catalog bounded and does
  // not split the primary Product -> Color -> Size hierarchy into tabs.
  assert.match(warehouse, /const RETURN_PRODUCT_PAGE_SIZE = 8/);
  assert.match(warehouse, /useDeferredValue/);
  assert.match(warehouse, /visibleGroups = groups\.slice/);
  assert.match(warehouse, /function buildReturnGroups/);
});

test("Return stock shows only the Product cover at group level and a color swatch beside each Size", () => {
  const warehouse = read("components/brand-portal/warehouse/WarehouseExperience.tsx");
  const data = read("lib/data/warehouse.ts");

  assert.match(warehouse, /<Image src=\{product\.productImage\} alt=\{product\.productName\}/);
  assert.match(warehouse, /<ColorSwatch swatchType=\{variant\.swatchType\}/);
  assert.match(warehouse, /\{size\}<\/span>/);
  assert.match(warehouse, /product\.colors\.reduce[\s\S]*Variants · \{product\.colors\.length\}/);
  assert.doesNotMatch(warehouse, /<Image src=\{variant\./);
  assert.match(data, /products!inner\(id, name, image, brand_id\)/);
  assert.match(data, /option_values\(label, swatch_type, primary_color, secondary_color, option_types\(name\)\)/);
  assert.match(data, /colorLabel: color\?\.label \?\? null/);
  assert.match(data, /sizeLabel: size\?\.label \?\? null/);
});

test("Return stock requires a side-by-side summary confirmation before submission", () => {
  const warehouse = read("components/brand-portal/warehouse/WarehouseExperience.tsx");

  assert.match(warehouse, /const \[confirming, setConfirming\] = useState\(false\)/);
  assert.match(warehouse, />Review return</);
  assert.match(warehouse, /Confirm stock return/);
  assert.match(warehouse, /Review every Variant and quantity/);
  assert.match(warehouse, /confirmationGroups\.map/);
  assert.match(warehouse, /\{color\.label\} · \{size\}/);
  assert.match(warehouse, /\{requestedQty\} \{requestedQty === 1 \? "unit" : "units"\}/);
  assert.match(warehouse, /immediately removes these units from available stock/);
  assert.match(warehouse, /Return hold at Zakhnook/);
  assert.match(warehouse, /allSelectedQuantitiesValid/);
  assert.match(warehouse, /Add a quantity for every selected Variant/);
  assert.match(warehouse, /onClick=\{submitReturn\}[\s\S]*Confirm return/);
  assert.doesNotMatch(warehouse, /onClick=\{submitReturn\}[\s\S]*Submit return request/);
});

test("Return stock uses checkbox selection for all results and for each complete Product", () => {
  const warehouse = read("components/brand-portal/warehouse/WarehouseExperience.tsx");

  assert.match(warehouse, /function BulkSelectionCheckbox/);
  assert.match(warehouse, /inputRef\.current\.indeterminate = indeterminate/);
  assert.match(warehouse, /const selectableVariantIds = useMemo/);
  assert.match(warehouse, /const allResultsSelected = selectableVariantIds\.length > 0/);
  assert.match(warehouse, /label=\{allResultsSelected \? "Clear all products in search results" : "Select all products in search results"\}/);
  assert.match(warehouse, /const productVariantIds = groupVariantIds\(product\)/);
  assert.match(warehouse, /`Select all Variants for \$\{product\.productName\}`/);
  assert.match(warehouse, /toggleVariants\(productVariantIds, checked\)/);
  assert.doesNotMatch(warehouse, /`Select all \(\$\{selectableVariantIds\.length\}\)`/);
});

test("Warehouse is document-only while Inventory owns the focused stock return action", () => {
  const warehouse = read("components/brand-portal/warehouse/WarehouseExperience.tsx");
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  const warehousePage = read("app/brand-portal/warehouse/page.tsx");
  const warehouseWorkspace = warehouse.slice(warehouse.indexOf("export default function WarehouseExperience"));
  assert.match(warehouse, /Track stock transfers, returns and recorded warehouse corrections for your brand/);
  assert.doesNotMatch(warehouseWorkspace, /Request stock return|ReturnRequestDrawer|setReturnOpen/);
  assert.doesNotMatch(warehousePage, /getBrandWarehouseVariants|variants=\{variants\}/);
  assert.match(inventory, /<ReturnRequestDrawer/);
  assert.match(warehouse, /Search document, product or SKU/);
  assert.match(warehouse, /Requested date range/);
  assert.match(warehouse, /Stock transfer note|warehouseDocumentLabel/);
  assert.match(warehouse, /label: "Needs review"/);
  assert.doesNotMatch(warehouse, /Warehouse summary/);
  assert.doesNotMatch(warehouse, /All brands/);
  assert.match(warehouse, /role="dialog"/);
  assert.match(warehouse, /variant\.colorLabel \|\| "Default"/);
  assert.match(warehouse, /variant\.sizeLabel \|\| "One size"/);
  assert.match(warehouse, /product\.colors\.entries\(\)/);
  assert.doesNotMatch(warehouse, /WorkspaceView|Warehouse views|view === "requests"|view === "history"/);
  assert.doesNotMatch(warehouse, /Held by your brand/);
  assert.doesNotMatch(warehouse, /Confirm held quantities/);
});

test("partner stock action role matrix keeps Owner enabled, Assistant hidden, and admin impersonation read-only", () => {
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  const stockPage = read("app/brand-portal/stock/page.tsx");
  const returnRoute = read("app/api/brand-portal/warehouse/returns/route.ts");

  assert.match(inventory, /const canRequestRestock = !readOnly && isMahalyPartner && accessLevel === "owner"/);
  assert.match(inventory, /\{canRequestRestock && <div aria-label="Inventory stock actions"/);
  assert.match(stockPage, /owner\.accessLevel === "owner" && !owner\.isImpersonating/);
  assert.match(returnRoute, /owner\.accessLevel !== "owner" \|\| owner\.isImpersonating/);
});

test("Warehouse understands every document lifecycle status", () => {
  const warehouse = read("components/admin/warehouse/warehouseUi.tsx");
  for (const status of ["draft", "pending", "submitted", "approved", "in_transit", "receiving", "partially_received", "received", "rejected", "cancelled"]) {
    assert.match(warehouse, new RegExp(`(?:"${status}"|\\b${status}:)`));
  }
});
