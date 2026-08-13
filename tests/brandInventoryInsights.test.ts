import assert from "node:assert/strict";
import test from "node:test";
import { estimateDaysRemaining, inventoryRiskScore, suggestedRestockQuantity } from "../lib/inventory/brandInventoryInsights.ts";

test("estimateDaysRemaining uses the last 30 days of sales and handles no-sales variants", () => {
  assert.equal(estimateDaysRemaining(10, 30), 10);
  assert.equal(estimateDaysRemaining(3, 12), 7.5);
  assert.equal(estimateDaysRemaining(8, 0), null);
});

test("suggestedRestockQuantity covers expected demand plus the stock buffer", () => {
  assert.equal(suggestedRestockQuantity(1, 5, 8), 12);
  assert.equal(suggestedRestockQuantity(12, 5, 3), 0);
  assert.equal(suggestedRestockQuantity(2, 5, 0), 8);
});

test("inventoryRiskScore puts out-of-stock and faster-selling variants first", () => {
  assert.ok(inventoryRiskScore({ quantity: 0, lowStockThreshold: 5, soldLast30Days: 0 }) < inventoryRiskScore({ quantity: 1, lowStockThreshold: 5, soldLast30Days: 3 }));
  assert.ok(inventoryRiskScore({ quantity: 2, lowStockThreshold: 5, soldLast30Days: 20 }) < inventoryRiskScore({ quantity: 8, lowStockThreshold: 5, soldLast30Days: 8 }));
});
