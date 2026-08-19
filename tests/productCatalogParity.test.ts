import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Admin and Brand Portal products use the same filters, quick views, status truth, and dialog primitive", () => {
  const admin = read("app/admin/products/page.tsx");
  const brand = read("app/brand-portal/products/page.tsx");
  for (const sharedComponent of ["ProductCatalogFilters", "ProductQuickViews"]) {
    assert.match(admin, new RegExp(sharedComponent));
    assert.match(brand, new RegExp(sharedComponent));
  }
  assert.match(read("components/admin/BulkProductActions.tsx"), /ProductStatusBadges/);
  assert.match(brand, /ProductStatusBadges/);
  assert.match(read("components/admin/AdminProductDeletionActions.tsx"), /ProductActionDialog/);
  assert.match(read("components/brand-portal/ProductRowActions.tsx"), /ProductActionDialog/);
});

test("canonical product presentation covers review, scheduled, paused, and stock-gated states", () => {
  const presentation = read("lib/products/presentation.ts");
  for (const status of ["pending_review", "changes_requested", "Scheduled", "Paused", "Waiting for stock", "Visible · in stock", "Visible · out of stock"]) {
    assert.match(presentation, new RegExp(status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Admin product list confirms bulk archive and has a real mobile card layout", () => {
  const workspace = read("components/admin/BulkProductActions.tsx");
  assert.match(workspace, /setConfirmArchive\(true\)/);
  assert.match(workspace, /Archived is final/);
  assert.match(workspace, /lg:hidden/);
  assert.match(workspace, /hidden overflow-x-auto lg:block/);
});

test("product search includes exact Variant SKUs on both operational surfaces", () => {
  assert.match(read("app/admin/products/page.tsx"), /variantSkus/);
  assert.match(read("app/brand-portal/products/page.tsx"), /product\.variantSkus\.join/);
  assert.match(read("lib/data/brandPortal.ts"), /variantSkus: variants\.map/);
});

test("Admin and Brand Portal share effective product and Variant price presentation", () => {
  const admin = read("components/admin/BulkProductActions.tsx");
  const brand = read("app/brand-portal/products/page.tsx");
  assert.match(admin, /ProductPriceDisplay/);
  assert.match(brand, /ProductPriceDisplay/);
  assert.match(read("lib/products/pricingPresentation.ts"), /getVariantEffectivePrice/);
  assert.match(read("lib/data/brandPortal.ts"), /discount_percent, discount_ends_at/);
});

test("product rows keep Pause visible and consolidate secondary actions in one shared overflow menu", () => {
  const adminActions = read("components/admin/AdminProductDeletionActions.tsx");
  const brandActions = read("components/brand-portal/ProductRowActions.tsx");
  const adminWorkspace = read("components/admin/BulkProductActions.tsx");
  for (const actions of [adminActions, brandActions]) {
    assert.match(actions, /ProductOverflowMenu/);
    assert.match(actions, /Pause/);
  }
  assert.doesNotMatch(adminWorkspace, /<Star|<Pencil/);
  assert.match(adminWorkspace, /text-mahalyred\/80/);
});
