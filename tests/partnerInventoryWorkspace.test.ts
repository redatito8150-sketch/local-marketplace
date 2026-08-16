import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("partner restock starts in Inventory and creates a warehouse document without changing live stock", () => {
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  assert.match(inventory, /Request restock/);
  assert.match(inventory, /\/api\/brand-portal\/warehouse\/transfers/);
  assert.match(inventory, /"Idempotency-Key": restockOperationKey\.current/);
  assert.match(inventory, /Available stock will not change until Zakhnook receives/);
  assert.doesNotMatch(inventory, /href=\{shipmentHref/);
});

test("partner inventory distinguishes available and incoming quantities", () => {
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  const data = read("lib/data/brandPortal.ts");
  assert.match(inventory, />Incoming</);
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

test("large inventories render in bounded pages — Inventory pagination now happens in Postgres (product-group cursor), never by loading every variant and slicing in React; Warehouse's own returns tab still bounds itself client-side over its own already-small active-variant list", () => {
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

  // Warehouse's Returns tab is a separate, smaller concern (not the grouped
  // Inventory page) — its own bounded client list is unchanged.
  assert.match(warehouse, /const PAGE_SIZE = 12/);
  assert.match(warehouse, /useDeferredValue/);
  assert.match(warehouse, /visibleVariants = filteredVariants\.slice/);
});

test("Warehouse is tracking and returns only; the editable held-stock prerequisite is gone", () => {
  const warehouse = read("components/brand-portal/warehouse/WarehouseExperience.tsx");
  assert.match(warehouse, /Create replenishment requests from Inventory/);
  assert.match(warehouse, /Restock requests/);
  assert.match(warehouse, /Request stock back/);
  assert.doesNotMatch(warehouse, /Held by your brand/);
  assert.doesNotMatch(warehouse, /Confirm held quantities/);
});

test("Warehouse understands every document lifecycle status", () => {
  const warehouse = read("components/brand-portal/warehouse/WarehouseExperience.tsx");
  for (const status of ["draft", "pending", "submitted", "approved", "in_transit", "receiving", "partially_received", "received", "rejected", "cancelled"]) {
    assert.match(warehouse, new RegExp(`${status}:`));
  }
});
