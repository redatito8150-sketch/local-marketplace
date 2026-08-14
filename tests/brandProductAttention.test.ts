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

test("product quick views include the archived catalog", () => {
  const products = readFileSync(path.join(root, "app/brand-portal/products/page.tsx"), "utf8");

  assert.match(products, /id: "archived" as const, label: "Archived", params: \{ status: "archived" \}/);
  assert.match(products, /archived: allProducts\.filter\(\(product\) => product\.status === "archived"\)\.length/);
  assert.match(products, /params\.status === "archived"/);
});
