import assert from "node:assert/strict";
import test from "node:test";
import { orderProgress, statusLabel } from "../src/domain/order-status.ts";

test("order statuses map to customer labels and progress", () => {
  assert.equal(statusLabel.pending, "Processing");
  assert.equal(statusLabel.fulfilled, "Delivered");
  assert.equal(orderProgress("pending"), 0);
  assert.equal(orderProgress("fulfilled"), 3);
  assert.equal(orderProgress("cancelled"), -1);
});
