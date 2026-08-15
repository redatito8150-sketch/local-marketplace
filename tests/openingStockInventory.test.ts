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

// Product creation/editing manages catalog information only now — a
// brand-new variant always starts at live quantity 0 regardless of actor/
// fulfillment mode, enforced at the RPC boundary (create_variant_with_
// opening_stock ignores p_opening_stock unconditionally), not merely by
// omitting a UI field.
test("saved variant quantity is never written by product persistence, and new variants never smuggle a nonzero opening stock", async () => {
  const source = await readFile(new URL("../lib/admin/variantPersistence.ts", import.meta.url), "utf8");
  const existingUpdate = source.slice(source.indexOf("if (existingId)"), source.indexOf("variantIds.push(existingId)"));
  assert.doesNotMatch(existingUpdate, /quantity:\s*edit\.quantity/);
  assert.match(source, /create_variant_with_opening_stock/);
  assert.match(source, /p_opening_stock:\s*0/);
  assert.doesNotMatch(source, /openingStock/);
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

// Product creation/editing collects catalog information only — no stock
// input anywhere, for anyone. VariantTable.tsx no longer has a Stock
// column at all (quantity is only ever visible/managed from Inventory,
// linked from a saved row's own action cell).
test("Product Editor never collects stock — no quantity input anywhere in the Variant Matrix", async () => {
  const source = await readFile(new URL("../components/admin/VariantTable.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Initial available quantity for/);
  assert.doesNotMatch(source, /openingStock/);
  assert.doesNotMatch(source, /variant\.quantity/);
  assert.match(source, /Open Inventory/);
});
