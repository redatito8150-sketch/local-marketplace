import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin navigation keeps the daily workflow short and moves secondary destinations behind More tools", () => {
  const sidebar = read("components/admin/AdminSidebar.tsx");

  for (const group of ["Run", "Build", "Experience", "Workspace"]) {
    assert.match(sidebar, new RegExp(`label: "${group}"`));
  }

  assert.match(sidebar, /More tools/);
  for (const href of [
    "/admin/payments",
    "/admin/payments/refund-queue",
    "/admin/low-stock",
    "/admin/warehouse",
    "/admin/applications",
    "/admin/products/review",
    "/admin/audit-log",
  ]) {
    assert.match(sidebar, new RegExp(href.replaceAll("/", "\\/")));
  }
});

test("Categories is one primary workspace with product structure and storefront tabs", () => {
  const sidebar = read("components/admin/AdminSidebar.tsx");
  const categories = read("app/admin/categories/page.tsx");
  const legacyTaxonomy = read("app/admin/products/categories/page.tsx");
  const legacyHeroes = read("app/admin/content/categories/page.tsx");

  assert.match(sidebar, /label: "Categories"[\s\S]*?href: "\/admin\/categories"/);
  assert.match(categories, /Product structure/);
  assert.match(categories, /Storefront heroes/);
  assert.match(categories, /<TaxonomyTreeView/);
  assert.match(categories, /<CategoryHeroForm/);
  assert.match(legacyTaxonomy, /redirect\("\/admin\/categories\?view=structure"\)/);
  assert.match(legacyHeroes, /permissions\.has\("manage_products"\)[\s\S]*?redirect\("\/admin\/categories\?view=storefront"\)/);
});
