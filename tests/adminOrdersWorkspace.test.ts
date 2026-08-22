import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { adminOrderNeedsAction, filterAdminOrders, getAdminOrderAttentionReasons, groupAdminOrders, normalizeAdminOrderFilters } from "../lib/orders/adminOrderFilters.ts";
import type { OrderRecord } from "../types/index.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "shipment-1", orderNumber: "LC-000001", masterOrderId: "purchase-1", masterOrderNumber: "ZK-000001",
    status: "confirmed", shippingName: "Mona Ali", shippingEmail: "mona@example.com", shippingPhone: "01000000000",
    shippingAddress: "1 Test Street", shippingCity: "Cairo", shippingGovernorate: "Cairo", subtotalUsd: 0,
    subtotalEgp: 900, discountAmountEgp: 0, createdAt: "2026-08-22T10:00:00.000Z", fulfillmentType: "brand_direct",
    shippingFeeEgp: 50, paymentMethod: "cash_on_delivery", paymentStatus: "unpaid", items: [{
      id: "item-1", productId: "product-1", variantId: "variant-1", name: "Thabat Top", brand: "Noori",
      price: 900, currency: "EGP", size: "M", color: "Baby Blue", quantity: 1, image: "/product.jpg",
    }],
    ...overrides,
  };
}

test("admin search covers purchase, customer, product, brand, color and size", () => {
  const sample = order();
  for (const query of ["ZK-000001", "mona", "thabat", "noori", "baby blue", "M"]) {
    assert.equal(filterAdminOrders([sample], { q: query }).length, 1, query);
  }
});

test("admin filter input is bounded and invalid URL dates/statuses cannot reach Postgres", () => {
  assert.deepEqual(normalizeAdminOrderFilters({ status: "not-a-status", from: "2026-99-99", queue: "wrong" }), {
    q: undefined,
    queue: "all",
    status: undefined,
    brand: undefined,
    from: undefined,
    to: undefined,
  });
  const normalized = normalizeAdminOrderFilters({ q: `  ${"x".repeat(200)}  `, brand: ` ${"b".repeat(150)} `, from: "2026-08-22", to: "2026-08-20" });
  assert.equal(normalized.q?.length, 160);
  assert.equal(normalized.brand?.length, 120);
  assert.equal(normalized.from, "2026-08-20");
  assert.equal(normalized.to, "2026-08-22");
});

test("Needs action is operational and payment-aware", () => {
  assert.equal(adminOrderNeedsAction(order()), false);
  assert.equal(adminOrderNeedsAction(order({ fulfillmentType: "mahaly_pool" })), true);
  assert.equal(adminOrderNeedsAction(order({ status: "preparing", paymentMethod: "card", paymentStatus: "unpaid" })), true);
  assert.equal(adminOrderNeedsAction(order({ status: "preparing", paymentMethod: "card", paymentStatus: "paid" })), false);
  assert.equal(adminOrderNeedsAction(order({ status: "fulfilled", paymentMethod: "card", paymentStatus: "paid", refundPendingAmountCents: 1000 })), true);
  assert.deepEqual(
    getAdminOrderAttentionReasons(order({ status: "shipped", trackingNumber: undefined })).map((reason) => reason.code),
    ["tracking_missing", "zakhnook_handoff"]
  );
  assert.equal(
    getAdminOrderAttentionReasons(order({ expectedDeliveryAt: "2026-08-20T10:00:00.000Z" }), new Date("2026-08-22T10:00:00.000Z"))[0]?.code,
    "delivery_overdue"
  );
});

test("sibling shipments are grouped into one purchase without losing totals or items", () => {
  const groups = groupAdminOrders([order(), order({ id: "shipment-2", orderNumber: "LC-000002", subtotalEgp: 400, shippingFeeEgp: 0 })]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].shipments.length, 2);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].subtotalEgp, 1350);
  assert.equal(groups[0].progress.total, 2);
  assert.equal(groups[0].progress.percent, 10);
});

test("Admin uses database pagination and purchase previews while Brand Portal remains untouched for the later parity pass", () => {
  const admin = read("components/admin/AdminOrdersWorkspace.tsx");
  const brand = read("components/brand-portal/BrandOrdersWorkspace.tsx");
  const adminPage = read("app/admin/orders/page.tsx");
  const brandPage = read("app/brand-portal/orders/page.tsx");

  for (const source of [admin, brand]) {
    assert.match(source, /All (?:purchases|orders)/);
    assert.match(source, /Needs (?:action|review)/);
    assert.match(source, /In progress/);
    assert.match(source, /Delivered/);
    assert.match(source, /DateRangePicker/);
  }
  assert.match(admin, /OrderItemThumbnail/);
  assert.match(brand, /OrderImage/);
  assert.match(adminPage, /getAdminOrderPurchasePage/);
  assert.match(adminPage, /getAdminPurchaseForAdminByOrderId/);
  assert.match(brandPage, /params\.order \? allOrders\.find/);
  assert.match(brandPage, /const PAGE_SIZE = 10/);
  assert.doesNotMatch(brand, /All brands/);
});

test("refund allocations use the real allocated_at schema column", () => {
  const refunds = read("lib/data/refunds.ts");
  assert.match(refunds, /amount_cents, allocated_at, reversed_at/);
  assert.match(refunds, /\.order\("allocated_at"/);
  assert.doesNotMatch(refunds, /payment_refund_allocations"\)[\s\S]*?amount_cents, created_at/);
});
