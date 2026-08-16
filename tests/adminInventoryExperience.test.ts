import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin Inventory is split into three focused brand-led workspaces", () => {
  const page = read("app/admin/inventory/page.tsx");
  for (const label of ["Zakhnook warehouse", "All inventory", "Movement history"]) {
    assert.match(page, new RegExp(label));
  }
  assert.ok(page.indexOf('label="All inventory"') < page.indexOf('label="Zakhnook warehouse"'));
  assert.ok(page.indexOf('label="Zakhnook warehouse"') < page.indexOf('label="Movement history"'));
  assert.match(page, /view === "warehouse"/);
  assert.match(page, /fulfillmentMode === "zakhnook_fulfilled"/);
  assert.match(page, /Choose a brand first/);
  assert.match(page, /Nothing from other brands is mixed into it/);
  assert.match(page, /new Intl\.NumberFormat\("en-US"\)/);
  assert.doesNotMatch(page, /Review low stock|Brand-led ledger|Open one focused workspace at a time|eyebrow="Inventory control"|All inventory by brand|Partner and non-partner inventory/);
});

test("inventory directory groups variants under brands and products without stock writes", () => {
  const data = read("lib/data/admin.ts");
  const start = data.indexOf("export async function getInventoryBrandSummariesForAdmin()");
  const end = data.indexOf("export async function getAuditLogsForEntity", start);
  const directory = start >= 0 && end > start ? data.slice(start, end) : "";
  assert.ok(directory);
  assert.match(directory, /from\("brands"\)/);
  assert.match(directory, /fulfillment_mode/);
  assert.match(directory, /getVariantsForProducts\(productIds, supabaseAdmin\)/);
  assert.match(directory, /calculateStockStatus/);
  assert.match(directory, /getInventoryBrandDetailForAdmin/);
  assert.doesNotMatch(directory, /\.update\(|\.insert\(|\.delete\(/);
});

test("brand product inventory resolves the exact Variant image and health", () => {
  const data = read("lib/data/admin.ts");
  const page = read("app/admin/inventory/page.tsx");
  assert.match(data, /from\("product_media"\)/);
  assert.match(data, /buildColorImageLookup\(mediaResult\.data \?\? \[\]\)/);
  assert.match(data, /image: resolveVariantImage\(product\.id, variant, colorImages, product\.image\)/);
  assert.match(page, /grouped by product and variant/);
  assert.match(page, /function VariantIdentity/);
  assert.match(page, /variant\.image/);
  assert.match(page, /variant\.stockStatus/);
});

test("brand identity never falls back to a product image and products start collapsed", () => {
  const data = read("lib/data/admin.ts");
  const page = read("app/admin/inventory/page.tsx");
  assert.doesNotMatch(data, /coverImage/);
  assert.match(page, /brand\.logoImage \?/);
  assert.doesNotMatch(page, /logoImage \|\|/);
  assert.match(page, /<details className="group/);
  assert.doesNotMatch(page, /<details[^>]*\sopen(?:=|\s|>)/);
  assert.match(page, /group-open:rotate-90/);
});

test("movement ledger is database-paginated inside a selected brand and product", () => {
  const data = read("lib/data/admin.ts");
  const page = read("app/admin/inventory/page.tsx");
  assert.match(data, /getInventoryMovementsForAdmin\(options: \{[\s\S]*?productId\?: string;[\s\S]*?brand\?: string;[\s\S]*?source\?: string;/);
  assert.match(data, /\.range\(from, to\)/);
  assert.match(page, /brand: detail\.name/);
  assert.match(page, /productId: selectedProduct\?\.id/);
  assert.match(page, /All products in \{detail\.name\}/);
  assert.match(page, /sequential, immutable movements/);
  assert.match(page, /row\.variantImage/);
  assert.match(page, /formatDateTime\(row\.createdAt\)/);
});
