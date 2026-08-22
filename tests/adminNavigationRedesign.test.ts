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
  assert.match(sidebar, /label: "Orders"[\s\S]*?children: \[[\s\S]*?label: "Payments"[\s\S]*?label: "Refund review"/);
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

test("the shared dashboard shell scopes browser-extension hydration tolerance to its controls", () => {
  const shell = read("components/dashboard/DashboardShell.tsx");
  assert.match(shell, /fdprocessedid/);
  assert.equal((shell.match(/suppressHydrationWarning/g) ?? []).length, 4);
  assert.doesNotMatch(shell, /<div[^>]*suppressHydrationWarning/);
});

test("the sidebar toggle stays visible outside the scroll area and matches the Brand Portal interaction", () => {
  const shell = read("components/dashboard/DashboardShell.tsx");
  assert.match(shell, /lg:overflow-visible/);
  assert.match(shell, /isAdmin && !collapsed \? "overflow-y-auto overflow-x-hidden" : "overflow-visible"/);
  assert.match(shell, /right-0 top-2 z-20/);
  assert.match(shell, /hover:-translate-y-px/);
  assert.match(shell, /active:scale-\[0\.96\]/);
  assert.match(shell, /hover:text-\[#C85956\]/);
});

test("workspace tabs connect commerce, brands, and storefront without bypassing permissions", () => {
  const nav = read("components/admin/AdminWorkspaceNav.tsx");

  for (const workspace of ["commerce", "brands", "storefront"]) {
    assert.match(nav, new RegExp(`${workspace}:`));
  }
  for (const href of [
    "/admin/orders",
    "/admin/payments",
    "/admin/payments/refund-queue",
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
  assert.doesNotMatch(nav, /inventory:/);
});

test("commerce destinations use the connected sidebar branch while other workspaces keep local navigation", () => {
  const pages = [
    ["app/admin/brands/page.tsx", "brands", "/admin/brands"],
    ["app/admin/applications/page.tsx", "brands", "/admin/applications"],
    ["app/admin/products/review/page.tsx", "brands", "/admin/products/review"],
    ["app/admin/page-studio/page.tsx", "storefront", "/admin/page-studio"],
    ["app/admin/content/page.tsx", "storefront", "/admin/content"],
  ] as const;

  for (const [page, workspace, activeHref] of pages) {
    assert.match(read(page), new RegExp(`AdminWorkspaceNav workspace="${workspace}" activeHref="${activeHref.replaceAll("/", "\\/")}"`));
  }

  for (const page of ["app/admin/orders/page.tsx", "app/admin/payments/page.tsx", "app/admin/payments/refund-queue/page.tsx"]) {
    assert.doesNotMatch(read(page), /AdminWorkspaceNav/);
  }

  const inventoryPage = read("app/admin/inventory/page.tsx");
  const warehousePage = read("app/admin/warehouse/page.tsx");
  assert.doesNotMatch(inventoryPage, /AdminWorkspaceNav/);
  assert.doesNotMatch(warehousePage, /AdminWorkspaceNav/);
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
