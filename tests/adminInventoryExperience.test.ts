import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin Inventory is one workspace with overview, stock requests, and Variant movements", () => {
  const nav = read("components/admin/AdminWorkspaceNav.tsx");
  const inventory = read("app/admin/inventory/page.tsx");
  const warehouse = read("app/admin/warehouse/page.tsx");

  for (const label of ["Inventory overview", "Stock requests", "Variant movements"]) {
    assert.match(nav, new RegExp(label));
  }
  assert.ok(nav.indexOf('label: "Inventory overview"') < nav.indexOf('label: "Stock requests"'));
  assert.ok(nav.indexOf('label: "Stock requests"') < nav.indexOf('label: "Variant movements"'));
  assert.match(inventory, /<AdminWorkspaceNav workspace="inventory"/);
  assert.match(warehouse, /<AdminWorkspaceNav workspace="inventory"/);
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
  assert.match(page, /function groupProductColors/);
  assert.match(page, /function ProductCard/);
  assert.match(page, /function ColorInventoryGroup/);
  assert.match(page, /function VariantSizeRow/);
  assert.match(page, /color\.variants\[0\]\?\.image/);
  assert.match(page, /variant\.stockStatus/);
  assert.match(page, /Open a color to inspect its sizes and stock/);
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
  assert.match(page, /All stock levels/);
  assert.match(page, /All product states/);
  assert.match(page, /Issues only/);
  assert.match(page, /rounded-full bg-amber-50/);
  assert.match(page, /text-\[10\.5px\].*Showing/);
});

test("movement ledger is database-paginated and supports an exact Variant", () => {
  const data = read("lib/data/admin.ts");
  const page = read("app/admin/inventory/page.tsx");

  assert.match(data, /getInventoryMovementsForAdmin\(options: \{[\s\S]*?productId\?: string;[\s\S]*?variantId\?: string;[\s\S]*?brand\?: string;[\s\S]*?source\?: string;/);
  assert.match(data, /\.range\(from, to\)/);
  assert.match(data, /query\.eq\("variant_id", options\.variantId\)/);
  assert.match(page, /productId: selectedProduct\?\.id/);
  assert.match(page, /variantId: selectedVariant\?\.id/);
  assert.match(page, /<Select label="Variant" name="variantId"/);
  assert.match(page, /sequential, immutable movements/);
  assert.match(page, /formatDateTime\(row\.createdAt\)/);
});

test("advanced movement filters collapse behind More filters without a wide single-row grid", () => {
  const page = read("app/admin/inventory/page.tsx");

  assert.match(page, /More filters/);
  assert.match(page, /const advancedActive = Boolean\(source \|\| movementType \|\| from \|\| to\)/);
  assert.match(page, /open=\{advancedActive \|\| undefined\}/);
  assert.match(page, /xl:grid-cols-4/);
  assert.doesNotMatch(page, /_140px_140px_120px_120px_auto/);
});

test("Stock requests uses consistent English copy and pinned English dates", () => {
  const warehouse = read("app/admin/warehouse/page.tsx");
  const detail = read("app/admin/warehouse/[id]/page.tsx");
  const history = read("components/warehouse/WarehouseDocumentHistory.tsx");

  assert.match(warehouse, />Stock requests<\/h1>/);
  assert.doesNotMatch(warehouse, /اذن صرف مخزن/);
  assert.match(warehouse, /formatDateTime\(transfer\.requestedAt\)/);
  assert.match(detail, /formatDateTime\(transfer\.requestedAt\)/);
  assert.match(history, /timestamp: transfer\.decidedAt/);
  assert.match(history, /formatDateTime\(entry\.timestamp\)/);
  assert.doesNotMatch(warehouse, /toLocaleString\(\)/);
  assert.doesNotMatch(detail, /toLocaleString\(\)/);
  assert.doesNotMatch(history, /toLocaleString\(\)/);
});
