import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static verification that app/admin/orders/[id]/page.tsx actually wires
// in the fixes from lib/admin/statuses.ts's getValidOrderStatusOptions
// (tested with real execution in tests/orderStatusTransitions.test.ts) —
// this project has no React/DOM test runner, so source-text verification
// is the established pattern for Server Component wiring (see
// tests/checkoutCardPixel.test.ts for the same approach elsewhere).

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

const orderDetailPage = read("app/admin/orders/[id]/page.tsx");

test("the status dropdown is built from getValidOrderStatusOptions(order.status, order.fulfillmentType) — never the raw, unconditional ORDER_STATUSES list", () => {
  assert.match(orderDetailPage, /import \{[^}]*getValidOrderStatusOptions[^}]*\} from "@\/lib\/admin\/statuses"/);
  assert.match(
    orderDetailPage,
    /options=\{getValidOrderStatusOptions\(order\.status, order\.fulfillmentType\)\.map/
  );
  // The old bug: every status handed to the dropdown with no idea which
  // ones are actually valid for this order's fulfillment_type.
  assert.doesNotMatch(orderDetailPage, /options=\{ORDER_STATUSES\.map/);
});

test("the redesigned workspace keeps payment method, status, attempt, refund, and reversal evidence", () => {
  assert.match(orderDetailPage, />Payment<\/p>/);
  assert.match(orderDetailPage, /order\.paymentMethod === "card"/);
  assert.match(orderDetailPage, /Card · Paymob/);
  assert.match(orderDetailPage, /Cash on delivery/);
  assert.match(orderDetailPage, /getOrderPaymentPresentation\(order\)/);
  assert.match(orderDetailPage, /order\.paymentAttemptId/);
  assert.match(orderDetailPage, /RecordOrderRefundAction/);
  assert.match(orderDetailPage, /ReverseRefundAllocationButton/);
});

test("the detail workspace keeps product images and builds a deduplicated, actor-aware activity feed", () => {
  assert.match(orderDetailPage, /<OrderItemThumbnail/);
  assert.match(orderDetailPage, /Lifecycle and admin history/);
  assert.match(orderDetailPage, /buildAdminOrderActivity\(order, auditLogs\)/);
  assert.match(orderDetailPage, /entry\.actorRole/);
  assert.match(orderDetailPage, /InternalNotesField/);
});

test("the detail workspace exposes purchase context, action reasons and optimistic shipment tracking", () => {
  assert.match(orderDetailPage, /Purchase overview/);
  assert.match(orderDetailPage, /purchase\.shipments\.map/);
  assert.match(orderDetailPage, /attentionReasons/);
  assert.match(orderDetailPage, /ShipmentTrackingForm/);
  assert.match(orderDetailPage, /updatedAt=\{order\.updatedAt\}/);
});
