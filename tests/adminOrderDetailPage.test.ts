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

test("the page renders a Payment section showing paymentMethod, paymentStatus, and (when present) paymentAttemptId — previously there was no evidence anywhere that an order was paid by card", () => {
  const paymentSectionMatch = orderDetailPage.match(
    /<h2 className="text-\[15px\] font-semibold text-ink">Payment<\/h2>[\s\S]*?<\/div>\s*<\/div>/
  );
  assert.ok(paymentSectionMatch, "expected to find the Payment section");
  const section = paymentSectionMatch![0];
  assert.match(section, /order\.paymentMethod === "card"/);
  assert.match(section, /Card \(Paymob\)/);
  assert.match(section, /Cash on Delivery/);
  assert.match(section, /order\.paymentStatus/);
  assert.match(section, /order\.paymentAttemptId/);
});
