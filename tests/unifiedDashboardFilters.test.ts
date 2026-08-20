import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard filters update immediately without an Apply or Sort by control", () => {
  const autoSubmit = read("components/dashboard/AutoSubmitForm.tsx");
  const shared = read("components/dashboard/DashboardFilters.tsx");
  const products = read("components/products/ProductCatalogFilters.tsx");
  const globals = read("app/globals.css");

  assert.match(autoSubmit, /data-auto-submit="true"/);
  assert.match(autoSubmit, /data-dashboard-filters="true"/);
  assert.match(autoSubmit, /form\.requestSubmit\(\)/);
  assert.match(autoSubmit, /setTimeout\(\(\) => submit\(form\), searchDelay\)/);
  assert.match(shared, /<AutoSubmitForm action=\{action\} className="mt-5">/);
  assert.match(shared, /export function DashboardMoreFilters/);
  assert.match(shared, /aria-label=\{label\}/);
  assert.match(shared, /order-\[6\]/);
  assert.match(shared, /<SlidersHorizontal/);
  assert.doesNotMatch(shared, /<AutoSubmitForm[^>]*bg-/);
  assert.doesNotMatch(shared, />\s*Apply\s*</);
  assert.match(products, /label="More product filters"/);
  assert.doesNotMatch(products, />\s*More filters\s*</);
  assert.doesNotMatch(products, />\s*Apply\s*</);
  assert.doesNotMatch(products, /name="sort"/);
  assert.match(globals, /\[data-dashboard-filters="true"\].*input:not\(\[type="hidden"\]\)/);
  assert.match(globals, /border-color: #e7e4de !important/);
  assert.match(globals, /background-color: #fff !important/);
  assert.match(globals, /box-shadow: 0 0 0 2px rgba\(231, 228, 222, 0\.72\) !important/);
  assert.doesNotMatch(globals, /border-color: #242424 !important/);
  assert.match(globals, /--tw-ring-shadow: 0 0 #0000 !important/);
});

test("filter toolbars follow search, quick views, secondary link, date, then More", () => {
  const products = read("components/products/ProductCatalogFilters.tsx");
  const quickViews = read("components/products/ProductQuickViews.tsx");
  const dateRange = read("components/brand-portal/DateRangePicker.tsx");
  const adminWarehouse = read("components/admin/warehouse/WarehouseQueueFilters.tsx");
  const brandWarehouse = read("components/brand-portal/warehouse/WarehouseExperience.tsx");
  const brandOrders = read("components/brand-portal/BrandOrdersWorkspace.tsx");
  const inventory = read("app/admin/inventory/page.tsx");

  assert.match(products, /relative order-\[1\][\s\S]*Search products/);
  assert.match(products, /<DashboardMoreFilters label="More product filters"/);
  assert.match(products, /<DashboardMoreFilters[\s\S]*label="Brand"[\s\S]*name="brand"/);
  assert.match(quickViews, /order-\[2\]/);
  assert.match(dateRange, /order-\[4\]/);
  assert.match(adminWarehouse, /order-\[1\][\s\S]*order-\[2\][\s\S]*<DateRangePicker[\s\S]*<DashboardMoreFilters/);
  assert.match(brandWarehouse, /order-\[1\][\s\S]*order-\[2\][\s\S]*<DateRangePicker[\s\S]*<DashboardMoreFilters/);
  assert.match(brandOrders, /order-\[1\][\s\S]*order-\[2\][\s\S]*<DateRangePicker/);
  assert.match(inventory, /aria-label="Quick movement filters" className="order-\[2\]/);
  assert.match(inventory, /group\/date relative order-\[4\]/);
  assert.match(inventory, /group\/filters order-\[6\]/);
});

test("quick operational filters use compact color markers and available counts", () => {
  const products = read("components/products/ProductQuickViews.tsx");
  const adminWarehouse = read("components/admin/warehouse/WarehouseQueueFilters.tsx");
  const brandWarehouse = read("components/brand-portal/warehouse/WarehouseExperience.tsx");
  const brandStock = read("app/brand-portal/stock/page.tsx");

  for (const source of [products, adminWarehouse, brandWarehouse, brandStock]) {
    assert.match(source, /h-1\.5 w-1\.5 rounded-full/);
  }
  assert.match(adminWarehouse, /statusCounts\[filter\.value\]/);
  assert.match(brandWarehouse, /statusCounts\[filter\.value\]/);
  assert.doesNotMatch(brandWarehouse, /matching documents<\/p>/);
});

test("admin and Brand Portal product catalogs share the same filter system and sortable table headers", () => {
  const admin = read("app/admin/products/page.tsx");
  const brand = read("app/brand-portal/products/page.tsx");
  const adminTable = read("components/admin/BulkProductActions.tsx");
  const quickViews = read("components/products/ProductQuickViews.tsx");

  assert.match(admin, /<ProductCatalogFilters/);
  assert.match(brand, /<ProductCatalogFilters/);
  assert.match(admin, /quickViews=\{<ProductQuickViews/);
  assert.match(brand, /quickViews=\{<ProductQuickViews/);
  assert.doesNotMatch(admin, /archived=\{\{ href: "\/admin\/products\/archived"/);
  assert.match(brand, /archived=\{\{ href: buildQuickViewHref\("\/brand-portal\/products\/archived"/);
  assert.match(quickViews, /aria-label="Product quick views"/);
  assert.match(quickViews, /border-r border-\[#eee7e1\]/);
  assert.match(admin, /\/>\}\n      \/>\n\n      <BulkProductActions/);
  assert.match(brand, /\/>\}\n      \/>\n\n      <DashboardPanel/);
  assert.doesNotMatch(brand, /Showing \{firstResult\}/);
  assert.match(adminTable, /SortableTableHeader/);
  assert.match(brand, /SortableTableHeader/);
  for (const label of ["Product", "Category", "Price", "Inventory"]) {
    assert.match(adminTable, new RegExp(`label="${label}"`));
    assert.match(brand, new RegExp(`label="${label}"`));
  }
  assert.match(adminTable, /label="Status & visibility"/);
  assert.match(brand, /label="Status"/);
});

test("date filtering uses one compact calendar control and auto-submits the chosen range", () => {
  const dateRange = read("components/brand-portal/DateRangePicker.tsx");
  const warehouse = read("components/admin/warehouse/WarehouseQueueFilters.tsx");
  const inventory = read("app/admin/inventory/page.tsx");

  assert.match(dateRange, /compact\?: boolean/);
  assert.match(dateRange, /form\?\.requestSubmit\(\)/);
  assert.match(dateRange, /aria-label=\{compact \? `\$\{label\}:/);
  assert.match(warehouse, /label="Requested date range"/);
  assert.match(warehouse, /compact/);
  assert.match(inventory, /aria-label="Choose date range"/);
  assert.doesNotMatch(inventory, /Apply date range/);
});

test("Brand Portal inventory uses compact health filters instead of oversized summary cards", () => {
  const stock = read("app/brand-portal/stock/page.tsx");

  assert.match(stock, /aria-label="Inventory health"/);
  assert.match(stock, /<AutoSubmitForm action="\/brand-portal\/stock"/);
  assert.doesNotMatch(stock, /Above alert level/);
  assert.doesNotMatch(stock, /Plan a restock/);
  assert.doesNotMatch(stock, /Unavailable to shoppers/);
  assert.doesNotMatch(stock, /units at Zakhnook/);
});
