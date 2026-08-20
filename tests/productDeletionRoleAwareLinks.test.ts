import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DeletionBlocker } from "../lib/admin/productDeletion.ts";
import { getAdminDeletionBlockerDestination } from "../lib/admin/productDeletionLinks.ts";
import {
  getBrandDeletionBlockerDestination,
  getBrandDeletionBlockerNotice,
} from "../lib/brand-portal/productDeletionLinks.ts";

const blocker = (code: string, kind: DeletionBlocker["kind"] = "immutable"): DeletionBlocker => ({
  code,
  kind,
  message: code,
  resolution: "Resolution",
});

test("Brand Portal blockers use only role-accessible, specifically labelled destinations", () => {
  const brandParam = "?brand=noori";
  assert.deepEqual(getBrandDeletionBlockerDestination(blocker("PRODUCT_HAS_COMPLETED_SALES"), brandParam), {
    href: "/brand-portal/orders?brand=noori",
    label: "View Orders",
  });
  assert.deepEqual(getBrandDeletionBlockerDestination(blocker("PRODUCT_HAS_WAREHOUSE_HISTORY"), brandParam), {
    href: "/brand-portal/warehouse?brand=noori",
    label: "View Warehouse Documents",
  });
  assert.deepEqual(getBrandDeletionBlockerDestination(blocker("PRODUCT_HAS_AVAILABLE_STOCK", "temporary"), brandParam), {
    href: "/brand-portal/stock?brand=noori",
    label: "Review Stock",
  });
  assert.deepEqual(getBrandDeletionBlockerDestination(blocker("BRAND_HAS_OPEN_FULFILLMENT_TRANSITION", "temporary"), brandParam), {
    href: "/brand-portal?brand=noori",
    label: "View Fulfillment Status",
  });
  for (const code of [
    "PRODUCT_HAS_ACTIVE_HOLD",
    "PRODUCT_HAS_UNRESOLVED_QUARANTINE",
    "PRODUCT_HAS_OPEN_PAYMENT_ATTEMPT",
    "PRODUCT_HAS_INVENTORY_HISTORY",
    "PRODUCT_HAS_REVIEWS",
    "PRODUCT_HAS_REFUNDS",
  ]) {
    assert.equal(getBrandDeletionBlockerDestination(blocker(code), brandParam), null, `${code} must not expose an admin link`);
  }
});

test("Brand Portal explains temporary admin-only blockers without exposing a dead action", () => {
  assert.match(getBrandDeletionBlockerNotice(blocker("PRODUCT_HAS_ACTIVE_HOLD", "temporary")) ?? "", /Mahaly Admin/);
  assert.match(getBrandDeletionBlockerNotice(blocker("PRODUCT_HAS_UNRESOLVED_QUARANTINE", "temporary")) ?? "", /No action is available in Brand Portal/);
  assert.match(getBrandDeletionBlockerNotice(blocker("PRODUCT_HAS_OPEN_PAYMENT_ATTEMPT", "temporary")) ?? "", /monitoring this payment/);
  assert.equal(getBrandDeletionBlockerNotice(blocker("PRODUCT_HAS_COMPLETED_SALES")), null);
});

test("Admin blockers keep admin destinations and specific labels", () => {
  assert.deepEqual(getAdminDeletionBlockerDestination(blocker("PRODUCT_HAS_INVENTORY_HISTORY"), "product/one"), {
    href: "/admin/inventory?productId=product%2Fone",
    label: "View Inventory",
  });
  assert.deepEqual(getAdminDeletionBlockerDestination(blocker("PRODUCT_HAS_REFUNDS"), "product"), {
    href: "/admin/payments",
    label: "View Payments",
  });
  assert.equal(getAdminDeletionBlockerDestination(blocker("PRODUCT_HAS_ACTIVE_HOLD", "temporary"), "product"), null);
});

test("every lifecycle surface renders destination labels and never the generic related-area action", () => {
  const archived = readFileSync("components/admin/ArchivedProductRowActions.tsx", "utf8");
  const lifecycle = readFileSync("components/shared/ProductLifecycleDialog.tsx", "utf8");
  const adminActions = readFileSync("components/admin/AdminProductDeletionActions.tsx", "utf8");
  const brandActions = readFileSync("components/brand-portal/ProductRowActions.tsx", "utf8");
  const brandArchivedPage = readFileSync("app/brand-portal/products/archived/page.tsx", "utf8");

  for (const source of [archived, lifecycle, adminActions, brandActions]) {
    assert.doesNotMatch(source, /Open related area/);
  }
  assert.match(archived, /getBrandDeletionBlockerDestination/);
  assert.match(archived, /getBrandDeletionBlockerNotice/);
  assert.match(archived, /eligibility\.temporaryBlockers/);
  assert.match(archived, /eligibility\.immutableReasons/);
  assert.doesNotMatch(archived, /hasTemporaryBlockers \? eligibility\.temporaryBlockers : eligibility\.immutableReasons/);
  assert.match(lifecycle, /destination\.label/);
  assert.match(lifecycle, /resolveBlockerNotice/);
  assert.match(brandActions, /getBrandDeletionBlockerDestination/);
  assert.match(brandArchivedPage, /brandParam=\{brandParam\}/);
});
