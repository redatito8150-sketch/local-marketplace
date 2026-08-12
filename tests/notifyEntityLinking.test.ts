import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// notify()'s NotifyOptions has two separate ways to attach an id:
// relatedEntityType+relatedEntityId (builds a real Discord link via
// getEntityAdminUrl AND populates notifications.related_entity_type/
// related_entity_id, which the website's own notification bell uses to
// link too) vs. entityId alone (shows as plain unlinked text, and never
// touches those DB columns). Every call site below previously used the
// second, silently-broken form despite having a real, resolvable entity to
// reference — this asserts each one was switched to the first, with a
// correct id value (not a human-readable code where the target admin page
// needs the real UUID/slug).

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("lib/admin/entityLinks.ts resolves role and payment_attempt entity types", () => {
  const source = read("lib/admin/entityLinks.ts");
  assert.match(source, /case "role":\s*\n\s*return `\/admin\/users\?tab=roles`;/);
  assert.match(source, /case "payment_attempt":\s*\n\s*return `\/admin\/payments\/\$\{entityId\}`;/);
});

test("lib/auditLog.ts's AuditEntityType and CHANNEL_BY_ENTITY cover role and payment_attempt", () => {
  const source = read("lib/auditLog.ts");
  assert.match(source, /\| "role"/);
  assert.match(source, /\| "payment_attempt"/);
  assert.match(source, /role: "auditUsersRoles"/);
  assert.match(source, /payment_attempt: "auditOrders"/);
});

const cases: { file: string; mustContain: RegExp; mustNotContain?: RegExp }[] = [
  {
    file: "app/api/admin/coupons/route.ts",
    mustContain: /relatedEntityType: "coupon",\s*\n\s*relatedEntityId: code,/,
  },
  {
    file: "app/api/admin/orders/[id]/route.ts",
    mustContain: /relatedEntityType: "order",\s*\n\s*relatedEntityId: params\.id,/,
  },
  {
    file: "app/api/admin/products/route.ts",
    mustContain: /relatedEntityType: "product",\s*\n\s*relatedEntityId: id,/,
  },
  {
    file: "app/api/admin/roles/route.ts",
    mustContain: /relatedEntityType: "role",\s*\n\s*relatedEntityId: data\.id,/,
  },
  {
    file: "app/api/admin/roles/[id]/route.ts",
    mustContain: /relatedEntityType: "role",\s*\n\s*relatedEntityId: params\.id,/,
  },
  {
    file: "app/api/admin/users/[id]/role/route.ts",
    mustContain: /relatedEntityType: "profile",\s*\n\s*relatedEntityId: params\.id,/,
  },
  {
    file: "app/api/brand-portal/brand-content/route.ts",
    mustContain: /relatedEntityType: "brand",\s*\n\s*relatedEntityId: owner\.brandSlug,/,
  },
  {
    file: "app/api/brand-portal/products/[id]/route.ts",
    mustContain: /relatedEntityType: "product",\s*\n\s*relatedEntityId: params\.id,/,
  },
  {
    file: "app/api/brands/[slug]/inline-edit/route.ts",
    mustContain: /relatedEntityType: "brand",\s*\n\s*relatedEntityId: slug,/,
  },
  {
    file: "app/api/orders/route.ts",
    mustContain: /relatedEntityType: "order",\s*\n\s*relatedEntityId: createdOrders\[0\]\?\.order_id,/,
  },
  {
    file: "app/api/payments/paymob/webhook/route.ts",
    mustContain: /relatedEntityType: "order",\s*\n\s*relatedEntityId: groupOrders\[0\]\?\.id,/,
  },
];

for (const { file, mustContain, mustNotContain } of cases) {
  test(`${file} notify() call uses relatedEntityType/relatedEntityId with a resolvable id`, () => {
    const source = read(file);
    assert.match(source, mustContain);
    if (mustNotContain) assert.doesNotMatch(source, mustNotContain);
  });
}

test("neither order-creation notify() call links via the human-readable order_number anymore", () => {
  for (const file of ["app/api/orders/route.ts", "app/api/payments/paymob/webhook/route.ts"]) {
    const source = read(file);
    assert.doesNotMatch(source, /entityId: (createdOrders|groupOrders)\[0\]\?\.order_number/);
  }
});

test("the two role admin-audit-log entries no longer misuse entityType 'profile' for a role id", () => {
  const createRoute = read("app/api/admin/roles/route.ts");
  const idRoute = read("app/api/admin/roles/[id]/route.ts");
  for (const source of [createRoute, idRoute]) {
    assert.match(source, /entityType: "role",/);
  }
});
