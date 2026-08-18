import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin navigation keeps the daily workflow short and groups operational routes under primary destinations", () => {
  const sidebar = read("components/admin/AdminSidebar.tsx");

  for (const group of ["Run", "Build", "Experience", "Workspace"]) {
    assert.match(sidebar, new RegExp(`label: "${group}"`));
  }

  assert.match(sidebar, /More tools/);
  for (const href of ["/admin/payments", "/admin/warehouse", "/admin/applications", "/admin/products/review", "/admin/content"]) {
    assert.match(sidebar, new RegExp(href.replaceAll("/", "\\/")));
  }
  assert.match(sidebar, /hideWhenPermission: "manage_brands"/);
  assert.match(sidebar, /hideWhenPermission: "manage_page_studio"/);
  assert.doesNotMatch(sidebar, /label: "Payments"/);
  assert.doesNotMatch(sidebar, /label: "Low Stock"/);
  assert.doesNotMatch(sidebar, /label: "Warehouse"/);
});

test("admin quick search tolerates browser-injected form attributes without hiding page-level hydration errors", () => {
  const search = read("components/admin/AdminQuickSearch.tsx");

  assert.match(search, /fdprocessedid/);
  assert.match(search, /<input[\s\S]*?suppressHydrationWarning[\s\S]*?type="text"/);
});

test("notification bells tolerate browser-injected attributes without suppressing the full header", () => {
  for (const path of [
    "components/admin/AdminNotificationBell.tsx",
    "components/account/AccountNotificationBell.tsx",
  ]) {
    const bell = read(path);
    assert.match(bell, /fdprocessedid|Form-filling browser extensions/);
    assert.match(bell, /<button[\s\S]*?suppressHydrationWarning[\s\S]*?aria-label="Notifications"/);
    assert.doesNotMatch(bell, /<div[^>]*suppressHydrationWarning/);
  }
});

test("workspace tabs connect commerce, inventory, brands, and storefront without bypassing permissions", () => {
  const nav = read("components/admin/AdminWorkspaceNav.tsx");

  for (const workspace of ["commerce", "inventory", "brands", "storefront"]) {
    assert.match(nav, new RegExp(`${workspace}:`));
  }
  for (const href of [
    "/admin/orders",
    "/admin/payments",
    "/admin/payments/refund-queue",
    "/admin/inventory",
    "/admin/warehouse",
    "/admin/brands",
    "/admin/applications",
    "/admin/products/review",
    "/admin/page-studio",
    "/admin/content",
  ]) {
    assert.match(nav, new RegExp(href.replaceAll("/", "\\/")));
  }

  assert.match(nav, /getUserPermissions\(user\.id\)/);
  assert.match(nav, /permissions\.has\(item\.permission\)/);
  assert.match(nav, /aria-current=/);
});

test("each workspace landing page renders its local navigation", () => {
  const pages = [
    ["app/admin/orders/page.tsx", "commerce", "/admin/orders"],
    ["app/admin/payments/page.tsx", "commerce", "/admin/payments"],
    ["app/admin/payments/refund-queue/page.tsx", "commerce", "/admin/payments/refund-queue"],
    ["app/admin/warehouse/page.tsx", "inventory", "/admin/warehouse"],
    ["app/admin/brands/page.tsx", "brands", "/admin/brands"],
    ["app/admin/applications/page.tsx", "brands", "/admin/applications"],
    ["app/admin/products/review/page.tsx", "brands", "/admin/products/review"],
    ["app/admin/page-studio/page.tsx", "storefront", "/admin/page-studio"],
    ["app/admin/content/page.tsx", "storefront", "/admin/content"],
  ] as const;

  for (const [page, workspace, activeHref] of pages) {
    assert.match(read(page), new RegExp(`AdminWorkspaceNav workspace="${workspace}" activeHref="${activeHref.replaceAll("/", "\\/")}"`));
  }

  // Inventory switches between its catalog and movement-ledger views, so its
  // activeHref is computed rather than a fixed string — assert the pattern
  // that computation follows instead of one literal href.
  const inventoryPage = read("app/admin/inventory/page.tsx");
  assert.match(inventoryPage, /AdminWorkspaceNav workspace="inventory" activeHref=\{activeHref\}/);
  assert.match(inventoryPage, /const activeHref = view === "activity" \? "\/admin\/inventory\?view=activity" : "\/admin\/inventory";/);
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
