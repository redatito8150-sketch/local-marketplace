import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateInventoryAdjustment } from "../lib/inventory/adjustmentValidation.ts";

test("inventory adjustment validates add, remove, and set operations", () => {
  for (const type of ["add", "remove", "set"]) {
    assert.equal(validateInventoryAdjustment({
      type, amount: 3, reason: "Manual Count", currentQuantity: 5,
    }), null);
  }
});

test("inventory adjustment requires a reason and rejects negative outcomes", () => {
  assert.match(validateInventoryAdjustment({
    type: "add", amount: 1, reason: "", currentQuantity: 0,
  })!, /reason/i);
  assert.match(validateInventoryAdjustment({
    type: "remove", amount: 6, reason: "Damaged Items", currentQuantity: 5,
  })!, /negative/i);
});

test("saved variant quantity is never written by product persistence", async () => {
  const source = await readFile(new URL("../lib/admin/variantPersistence.ts", import.meta.url), "utf8");
  const existingUpdate = source.slice(source.indexOf("if (existingId)"), source.indexOf("variantIds.push(existingId)"));
  assert.doesNotMatch(existingUpdate, /quantity:\s*edit\.quantity/);
  assert.match(source, /create_variant_with_opening_stock/);
  assert.match(source, /p_opening_stock:\s*edit\.openingStock/);
});

test("migration provides immutable ledger, exact-once opening stock, and atomic order history", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20260803000001_opening_stock_inventory_workflow.sql", import.meta.url), "utf8");
  assert.match(sql, /unique \(variant_id, source_operation_key\)/);
  assert.match(sql, /Inventory history is immutable/);
  assert.match(sql, /for update of pv/);
  assert.match(sql, /order_items_inventory_movement/);
  assert.match(sql, /orders_cancelled_inventory_movements/);
  assert.match(sql, /legacy-opening-balance-v1/);
});

test("Product Editor distinguishes Opening Stock from saved Current Stock", async () => {
  // Opening Stock is edited inline in the unified Variant table
  // (VariantTable.tsx) — editable only while a variant is unsaved
  // (`persisted` false); once saved it renders as read-only text with a
  // deep link into Inventory, and can never be edited from the editor again.
  const source = await readFile(new URL("../components/admin/VariantTable.tsx", import.meta.url), "utf8");
  assert.match(source, /persisted\s*\?/);
  assert.match(source, /Opening stock for/);
  assert.match(source, /Managed from Inventory/);
  assert.match(source, /Open Inventory/);
});
