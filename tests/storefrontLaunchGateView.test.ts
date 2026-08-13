import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Item 4: product-launch enforcement centralized into a single database
// access boundary (public.storefront_products), replacing the earlier
// client-built-brand-id-list approach that only ever covered one query.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

const VIEW_PATH = "supabase/migrations/20260814000006_storefront_launch_gate_view.sql";
const viewMigration = read(VIEW_PATH);

test("storefront_products is a security_invoker view — RLS/grants on the underlying products/brands tables still apply as the querying role, this only adds the launch-gate condition on top", () => {
  assert.match(viewMigration, /create or replace view public\.storefront_products\s*\nwith \(security_invoker = true\)/);
  assert.match(
    viewMigration,
    /where b\.fulfillment_mode <> 'zakhnook_fulfilled' or p\.first_stocked_at is not null;/
  );
});

test("the view never does `select p.*` — only the same explicit public column allowlist PRODUCT_PUBLIC_SELECT already uses, plus first_stocked_at", () => {
  const withoutComments = viewMigration.replace(/--[^\r\n]*/g, "");
  assert.doesNotMatch(withoutComments, /select\s+p\.\*/i);
  const productsTs = read("lib/data/products.ts");
  const selectLine = productsTs.match(/export const PRODUCT_PUBLIC_SELECT =\s*\n?\s*"([^"]+)"/)![1];
  const publicSelectColumns = selectLine.split(",").map((c) => c.trim());
  for (const column of publicSelectColumns) {
    assert.ok(viewMigration.includes(`p.${column}`), `expected the view to select p.${column}`);
  }
  assert.ok(viewMigration.includes("p.first_stocked_at"));
});

test("the two new columns the view's WHERE clause depends on are explicitly granted to anon/authenticated — a security_invoker view needs column privilege for WHERE-only references too, not just the output list", () => {
  assert.match(viewMigration, /grant select \(first_stocked_at\) on public\.products to anon, authenticated;/);
  assert.match(viewMigration, /grant select \(fulfillment_mode\) on public\.brands to anon, authenticated;/);
});

test("the view itself is granted to anon, authenticated, AND service_role — the launch-gate WHERE clause is a plain condition (not an RLS policy), so it applies even to service-role checkout/cart-validation queries that bypass RLS entirely", () => {
  assert.match(viewMigration, /grant select on public\.storefront_products to anon, authenticated, service_role;/);
});

test("every customer-facing product listing/detail function in lib/data/products.ts sources from storefront_products, not the raw products table, and the old client-built brand-id-list helper is gone", () => {
  const src = read("lib/data/products.ts");
  assert.doesNotMatch(src, /resolveZakhnookFulfilledBrandIds/);
  assert.doesNotMatch(src, /\.from\("products"\)/);
  // getMarketplaceCatalogPage no longer needs its own bespoke .or() launch
  // filter — the view already enforces it.
  assert.doesNotMatch(src, /unlaunchedBrandIds/);
  const occurrences = src.match(/\.from\("storefront_products"\)/g) ?? [];
  assert.ok(occurrences.length >= 10, `expected at least 10 storefront_products reads, found ${occurrences.length}`);
});

test("lib/data/brands.ts and lib/data/collections.ts (brand page / collection listings) also source from storefront_products", () => {
  assert.match(read("lib/data/brands.ts"), /\.from\("storefront_products"\)/);
  const collections = read("lib/data/collections.ts");
  assert.doesNotMatch(collections, /\.from\("products"\)/);
  const occurrences = collections.match(/\.from\("storefront_products"\)/g) ?? [];
  assert.equal(occurrences.length, 3);
});

test("lib/cart/liveValidation.ts (cart validation) sources from storefront_products, so a not-yet-launched product's cart line resolves as unavailable rather than trusting a stale localStorage snapshot", () => {
  const src = read("lib/cart/liveValidation.ts");
  assert.match(src, /\.from\("storefront_products"\)/);
  assert.doesNotMatch(src, /\.from\("products"\)/);
});

test("checkout (app/api/orders/route.ts, COD) explicitly re-checks the launch gate itself — it can't source from the view directly since it needs the brands!...!inner embed the view can't expose, so the same condition is checked inline", () => {
  const src = read("app/api/orders/route.ts");
  assert.match(src, /first_stocked_at, brands!products_brand_slug_fkey!inner\(is_active, fulfillment_mode\)/);
  assert.match(src, /const isLaunched = brand\?\.fulfillment_mode !== "zakhnook_fulfilled" \|\| product\?\.first_stocked_at != null;/);
  assert.match(src, /!isLaunched\s*\n\s*\) \{/);
});

test("checkout (card/Paymob path — lib/payments/intentionCart.ts + the intention route) also explicitly re-checks the launch gate", () => {
  const cartLib = read("lib/payments/intentionCart.ts");
  assert.match(cartLib, /brands: \{ is_active: boolean; fulfillment_mode: string \} \| null;/);
  assert.match(cartLib, /first_stocked_at: string \| null;/);
  assert.match(cartLib, /const isLaunched = product\?\.brands\?\.fulfillment_mode !== "zakhnook_fulfilled" \|\| product\?\.first_stocked_at != null;/);
  assert.match(cartLib, /!isLaunched\s*\n\s*\) \{/);

  const route = read("app/api/payments/paymob/intention/route.ts");
  assert.match(route, /first_stocked_at, brands!products_brand_slug_fkey!inner\(is_active, fulfillment_mode\)/);
});
