import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin Inventory uses the same health-and-activity operating model as Brand Portal", () => {
  const admin = read("app/admin/inventory/page.tsx");
  const brandPortal = read("app/brand-portal/stock/page.tsx");
  const brandInventoryManager = read("components/brand-portal/InventoryManager.tsx");

  for (const label of ["Inventory health", "All variants", "Healthy", "Low stock", "Out of stock", "Inventory activity"]) {
    assert.match(admin, new RegExp(label));
    assert.match(`${brandPortal}\n${brandInventoryManager}`, new RegExp(label));
  }

  assert.match(admin, /Overview & activity|workspace="inventory"/);
  assert.match(admin, /Incoming stock/);
  assert.match(admin, /Recent activity/);
  assert.match(admin, /Catalog coverage/);
});

test("inventory overview computes marketplace health without changing stock", () => {
  const data = read("lib/data/admin.ts");
  const start = data.indexOf("export async function getInventoryOverviewForAdmin()");
  const end = data.indexOf("export async function getAuditLogsForEntity", start);
  const overview = start >= 0 && end > start ? data.slice(start, end) : "";

  assert.ok(overview);
  assert.match(overview, /Promise\.all\(/);
  assert.match(overview, /calculateStockStatus/);
  assert.match(overview, /totalAvailableUnits/);
  assert.match(overview, /openTransferCount/);
  assert.match(overview, /movementsLast24Hours/);
  assert.doesNotMatch(overview, /\.update\(|\.insert\(|\.delete\(/);
});

test("inventory activity filters are database-paginated and preserve the product audit link", () => {
  const data = read("lib/data/admin.ts");
  const page = read("app/admin/inventory/page.tsx");

  assert.match(data, /getInventoryMovementsForAdmin\(options: \{[\s\S]*?q\?: string;[\s\S]*?brand\?: string;[\s\S]*?source\?: string;[\s\S]*?movementType\?: string;/);
  assert.match(data, /\.range\(from, to\)/);
  assert.match(data, /query\.eq\("source", options\.source\)/);
  assert.match(data, /query\.eq\("movement_type", options\.movementType\)/);
  assert.match(page, /productId: params\.productId/);
  assert.match(page, /\/admin\/products\/\$\{row\.productId\}\/edit/);
});
