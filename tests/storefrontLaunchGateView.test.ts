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

// supabase/migrations/20260815000000_product_launch_policy_and_opening_stock.sql
// is the CURRENT, authoritative re-declaration of storefront_products / the
// products RLS policy / the launch-gate predicate — it replaces
// fulfillment_mode-keyed gating with the explicit products.launch_policy
// column (private.is_product_customer_visible), and adds
// first_visible_at. Tests below that assert on *current* behavior read
// this file; tests that assert on the superseded 20260814000006 file's own
// internal consistency (still true statements about that historical file)
// are left reading viewMigration unchanged.
const LAUNCH_POLICY_MIGRATION_PATH = "supabase/migrations/20260815000000_product_launch_policy_and_opening_stock.sql";
const launchPolicyMigration = read(LAUNCH_POLICY_MIGRATION_PATH);

test("storefront_products is a security_invoker view — RLS/grants on the underlying products/brands tables still apply as the querying role, this only adds the launch-gate condition on top", () => {
  assert.match(viewMigration, /create or replace view public\.storefront_products\s*\nwith \(security_invoker = true\)/);
  // Item 1 (second corrective pass): the launch-gate condition now lives in
  // the shared private.is_product_storefront_launch_gated() helper so the
  // exact same check also backs the products table's own RLS SELECT policy
  // — a security_invoker view is not itself an access boundary, so relying
  // on an inline view-only WHERE clause here would leave direct table
  // access to public.products ungated.
  assert.match(
    viewMigration,
    /where private\.is_product_storefront_launch_gated\(p\.brand_id, p\.first_stocked_at\);/
  );
});

test("the shared launch-gate helper is SECURITY DEFINER (brand_fulfillment_transitions has no public RLS read policy, so an invoker-rights check would be vacuously true for anon/authenticated) and excludes brands with any nonterminal fulfillment transition, in addition to the original zakhnook_fulfilled/first_stocked_at rule", () => {
  const fn = viewMigration.match(/create or replace function private\.is_product_storefront_launch_gated\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /security definer/);
  assert.match(fn, /set search_path = ''/);
  assert.match(
    fn,
    /not exists \(\s*\n\s*select 1 from public\.brands b\s*\n\s*where b\.id = p_brand_id and b\.fulfillment_mode = 'zakhnook_fulfilled'\s*\n\s*\)\s*\n\s*or p_first_stocked_at is not null/
  );
  assert.match(
    fn,
    /and not exists \(\s*\n\s*select 1 from public\.brand_fulfillment_transitions bft\s*\n\s*where bft\.brand_id = p_brand_id\s*\n\s*and bft\.status not in \('completed', 'cancelled', 'failed'\)\s*\n\s*\);/
  );
  assert.match(viewMigration, /revoke all on function private\.is_product_storefront_launch_gated\(uuid, timestamptz\) from public;/);
  assert.match(
    viewMigration,
    /grant execute on function private\.is_product_storefront_launch_gated\(uuid, timestamptz\)\s*\n\s*to anon, authenticated, service_role;/
  );
});

test("item 1: the real access boundary is the products table's own RLS SELECT policy, not just the view — it reuses the same shared helper so direct anon/authenticated access to public.products cannot bypass the launch gate", () => {
  const policy = viewMigration.match(/create policy "Public can read published products"\s*\n\s*on public\.products for select[\s\S]*?;/i)![0];
  assert.match(policy, /to anon, authenticated/);
  assert.match(policy, /status = 'published'/);
  assert.match(policy, /private\.is_product_storefront_launch_gated\(products\.brand_id, products\.first_stocked_at\)/);
});

test("item 2: storefront_products also excludes brands with any nonterminal fulfillment transition — checkout already rejects these, so the view/RLS must not still advertise them as available", () => {
  const fn = viewMigration.match(/create or replace function private\.is_product_storefront_launch_gated\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /bft\.status not in \('completed', 'cancelled', 'failed'\)/);
});

test("the current storefront_products view (20260815000000) never does `select p.*` — only the same explicit public column allowlist PRODUCT_PUBLIC_SELECT already uses, plus first_stocked_at/launch_policy/first_visible_at", () => {
  const currentView = launchPolicyMigration.match(/create or replace view public\.storefront_products[\s\S]*?;\r?\n\r?\ngrant select/)![0];
  const withoutComments = currentView.replace(/--[^\r\n]*/g, "");
  assert.doesNotMatch(withoutComments, /select\s+p\.\*/i);
  const productsTs = read("lib/data/products.ts");
  const selectLine = productsTs.match(/export const PRODUCT_PUBLIC_SELECT =\s*\n?\s*"([^"]+)"/)![1];
  const publicSelectColumns = selectLine.split(",").map((c) => c.trim());
  for (const column of publicSelectColumns) {
    assert.ok(currentView.includes(`p.${column}`), `expected the view to select p.${column}`);
  }
  assert.ok(currentView.includes("p.first_stocked_at"));
  assert.ok(currentView.includes("p.launch_policy"));
  assert.ok(currentView.includes("p.first_visible_at"));
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

test("checkout (app/api/orders/route.ts, COD) explicitly re-checks the launch-policy gate itself — it can't source from the view directly since it needs the brands!...!inner embed the view can't expose, so the same condition is checked inline", () => {
  const src = read("app/api/orders/route.ts");
  assert.match(src, /first_stocked_at, launch_policy, brands!products_brand_slug_fkey!inner\(is_active\)/);
  assert.match(src, /const isLaunched = product\?\.launch_policy !== "when_stocked" \|\| product\?\.first_stocked_at != null;/);
  assert.match(src, /!isLaunched\s*\n\s*\) \{/);
});

test("checkout (card/Paymob path — lib/payments/intentionCart.ts + the intention route) also explicitly re-checks the launch-policy gate", () => {
  const cartLib = read("lib/payments/intentionCart.ts");
  assert.match(cartLib, /brands: \{ is_active: boolean \} \| null;/);
  assert.match(cartLib, /first_stocked_at: string \| null;/);
  assert.match(cartLib, /launch_policy: "show_now" \| "when_stocked" \| null;/);
  assert.match(cartLib, /const isLaunched = product\?\.launch_policy !== "when_stocked" \|\| product\?\.first_stocked_at != null;/);
  assert.match(cartLib, /!isLaunched\s*\n\s*\) \{/);

  const route = read("app/api/payments/paymob/intention/route.ts");
  assert.match(route, /first_stocked_at, launch_policy, brands!products_brand_slug_fkey!inner\(is_active\)/);
});
