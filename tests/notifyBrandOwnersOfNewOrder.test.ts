import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { groupOrderItemsByBrandSlug, type OrderItemRow } from "../lib/orders/groupOrderItemsByBrandSlug.ts";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

function row(overrides: Partial<OrderItemRow> = {}): OrderItemRow {
  return {
    id: "item-1",
    product_id: "prod-1",
    variant_id: "variant-1",
    name: "Linen Shirt",
    brand: "Studio A",
    brand_slug: "studio-a",
    price: 500,
    currency: "EGP",
    size: "M",
    color: "Sand",
    quantity: 1,
    image: "https://example.com/shirt.jpg",
    ...overrides,
  };
}

test("groupOrderItemsByBrandSlug groups a brand_direct order's single-brand items together", () => {
  const groups = groupOrderItemsByBrandSlug([
    row({ id: "item-1", brand_slug: "studio-a" }),
    row({ id: "item-2", brand_slug: "studio-a", name: "Tote Bag" }),
  ]);
  assert.equal(groups.size, 1);
  assert.equal(groups.get("studio-a")!.length, 2);
});

// The whole point of this feature: a pooled (mahaly_pool) order can hold
// several partner brands' items in the same orders row — each brand must
// only ever see its own lines, never a sibling partner's.
test("groupOrderItemsByBrandSlug splits a pooled order's mixed-brand items into separate, non-overlapping groups", () => {
  const groups = groupOrderItemsByBrandSlug([
    row({ id: "item-1", brand_slug: "partner-a", name: "Partner A Shirt" }),
    row({ id: "item-2", brand_slug: "partner-b", name: "Partner B Bag" }),
    row({ id: "item-3", brand_slug: "partner-a", name: "Partner A Hat" }),
  ]);
  assert.equal(groups.size, 2);
  const partnerAItems = groups.get("partner-a")!;
  const partnerBItems = groups.get("partner-b")!;
  assert.equal(partnerAItems.length, 2);
  assert.equal(partnerBItems.length, 1);
  assert.ok(partnerAItems.every((item) => item.name !== "Partner B Bag"));
  assert.ok(partnerBItems.every((item) => item.name.startsWith("Partner B")));
});

test("groupOrderItemsByBrandSlug drops rows with no brand_slug — nothing to attribute, nobody to notify", () => {
  const groups = groupOrderItemsByBrandSlug([row({ brand_slug: null })]);
  assert.equal(groups.size, 0);
});

test("groupOrderItemsByBrandSlug maps nullable DB fields to the OrderItemRecord shape correctly", () => {
  const groups = groupOrderItemsByBrandSlug([
    row({ variant_id: null, color: null, price: "199.99" as unknown as number }),
  ]);
  const [item] = groups.get("studio-a")!;
  assert.equal(item.variantId, undefined);
  assert.equal(item.color, undefined);
  assert.equal(item.price, 199.99);
  assert.equal(typeof item.price, "number");
});

test("brandNewOrderEmail scopes to name/city/governorate only — never phone, email, or full address", () => {
  const source = read("lib/email/templates/brandNewOrder.ts");
  assert.doesNotMatch(source, /shippingPhone|shippingEmail|shippingAddress/);
  assert.match(source, /shippingName/);
  assert.match(source, /shippingCity/);
  assert.match(source, /shippingGovernorate/);
});

test("both order-creation routes call notifyBrandOwnersOfNewOrder after an order exists", () => {
  const codRoute = read("app/api/orders/route.ts");
  assert.match(codRoute, /import \{ notifyBrandOwnersOfNewOrder \} from "@\/lib\/orders\/notifyBrandOwnersOfNewOrder";/);
  assert.match(codRoute, /await notifyBrandOwnersOfNewOrder\(created\.order_id\);/);

  const webhookRoute = read("app/api/payments/paymob/webhook/route.ts");
  assert.match(
    webhookRoute,
    /import \{ notifyBrandOwnersOfNewOrder \} from "@\/lib\/orders\/notifyBrandOwnersOfNewOrder";/
  );
  assert.match(webhookRoute, /await notifyBrandOwnersOfNewOrder\(groupOrder\.id\);/);
});

test("brand owner resolution reuses getBrandMembersForAdmin (owners only, not assistants) instead of a new duplicate query", () => {
  const source = read("lib/orders/notifyBrandOwnersOfNewOrder.ts");
  assert.match(source, /import \{ getBrandMembersForAdmin \} from "@\/lib\/data\/admin";/);
  assert.match(source, /members\?\.owners/);
  assert.doesNotMatch(source, /\.assistants/);
});
