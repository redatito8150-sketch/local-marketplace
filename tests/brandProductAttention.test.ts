import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("overview and product queue share the same product-level attention rule", () => {
  const overview = readFileSync(path.join(root, "app/brand-portal/page.tsx"), "utf8");
  const products = readFileSync(path.join(root, "app/brand-portal/products/page.tsx"), "utf8");

  assert.match(overview, /products\.filter\(needsBrandProductAttention\)/);
  assert.match(overview, /const pendingActions = attentionProducts\.length/);
  assert.match(overview, /brand-portal\/products/);
  assert.match(products, /allProducts\.filter\(needsBrandProductAttention\)/);
  assert.match(products, /params\.attention && !needsBrandProductAttention\(product\)/);
});

test("overview attention count does not count variants independently", () => {
  const overview = readFileSync(path.join(root, "app/brand-portal/page.tsx"), "utf8");

  assert.doesNotMatch(overview, /pendingOrders\.length \+ lowStock\.length/);
  assert.doesNotMatch(overview, /outOfStock\.length \+ pendingProducts\.length/);
});

// Product deletion lifecycle (supabase/migrations/
// 20260814020000_product_deletion_lifecycle.sql, item 1) removed the
// inline "Archived" quick-view tile in favor of a dedicated, database-
// paginated Retired page — the main product list now deliberately
// excludes archived (Retired) products entirely, so they never clutter
// the default catalog view.
test("the main product list excludes retired products and links to a dedicated, database-paginated Retired page instead of an inline quick-view tile", () => {
  const products = readFileSync(path.join(root, "app/brand-portal/products/page.tsx"), "utf8");

  assert.doesNotMatch(products, /id: "archived" as const, label: "Archived", params: \{ status: "archived" \}/);
  assert.match(products, /allProductsWithRetired\.filter\(\(product\) => product\.status !== "archived"\)/);
  assert.match(products, /listRetiredProducts\(/);
  assert.match(products, /retiredCount/);
});
