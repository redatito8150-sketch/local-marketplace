import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static verification of the order pricing snapshot migration + its TS call
// sites — same established pattern as tests/masterOrders.test.ts /
// tests/paymentsAdminMigration.test.ts, since this is SQL/DB-coupled code
// with no live Postgres available in this environment.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

const MIGRATION_PATH = "supabase/migrations/20260813000002_order_pricing_snapshots.sql";
const migration = read(MIGRATION_PATH);

test("order_items gains four new, safe-defaulted/nullable pricing snapshot columns", () => {
  assert.match(migration, /alter table public\.order_items add column if not exists original_unit_price numeric\(10, 2\);/);
  assert.match(migration, /alter table public\.order_items add column if not exists discount_percent_snapshot numeric\(5, 2\);/);
  assert.match(migration, /alter table public\.order_items add column if not exists discount_source text;/);
  assert.match(
    migration,
    /alter table public\.order_items add column if not exists item_coupon_discount_egp numeric\(10, 2\) not null default 0;/
  );
});

test("discount_source is constrained to the three known values, item_coupon_discount_egp can never be negative", () => {
  assert.match(
    migration,
    /check \(discount_source is null or discount_source in \('product_discount', 'variant_discount', 'none'\)\)/
  );
  assert.match(migration, /check \(item_coupon_discount_egp >= 0\)/);
});

test("private.place_order writes the pricing snapshot fields onto every inserted order_items row, sourced from p_items (never derived server-side from a live product)", () => {
  const fn = migration.match(/create or replace function private\.place_order\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /v_original_unit_price := nullif\(v_item ->> 'original_unit_price', ''\)::numeric;/);
  assert.match(fn, /v_discount_percent_snapshot := nullif\(v_item ->> 'discount_percent_snapshot', ''\)::numeric;/);
  assert.match(fn, /v_discount_source := nullif\(v_item ->> 'discount_source', ''\);/);
  assert.match(
    fn,
    /original_unit_price, discount_percent_snapshot, discount_source, item_coupon_discount_egp/
  );
});

test("private.place_order allocates each bucket's coupon discount across its own items, last EGP item absorbing the rounding remainder", () => {
  const fn = migration.match(/create or replace function private\.place_order\([\s\S]*?\n\$\$;/i)![0];
  // Two-subpass structure per bucket: A counts EGP items without writing,
  // B does the actual insert + per-item allocation.
  assert.match(fn, /Sub-pass A: bucket EGP subtotal \+ EGP item count, no writes\./);
  assert.match(fn, /Sub-pass B: actual inserts, with each item's own coupon share\./);
  assert.match(fn, /if v_bucket_egp_item_seen = v_bucket_egp_item_count then/);
  assert.match(fn, /v_item_coupon_discount := v_bucket_discount - v_bucket_discount_assigned;/);
  assert.match(
    fn,
    /v_item_coupon_discount := round\(v_bucket_discount \* \(v_price \* v_quantity\) \/ v_subtotal_egp, 2\);/
  );
});

test("private.place_order never allocates a coupon share to a USD line item", () => {
  const fn = migration.match(/create or replace function private\.place_order\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if v_currency = 'EGP' and v_bucket_discount > 0 then/);
});

test("public.place_paid_order records each item's coupon share as-is from cart_snapshot rather than recomputing it (the amount actually charged via Paymob, never re-derived at fulfillment)", () => {
  const fn = migration.match(/create or replace function public\.place_paid_order\(p_payment_attempt_id uuid\)[\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /v_item_coupon_discount := coalesce\(nullif\(v_item ->> 'itemCouponDiscountEgp', ''\)::numeric, 0\);/
  );
  assert.match(
    fn,
    /original_unit_price, discount_percent_snapshot, discount_source, item_coupon_discount_egp/
  );
  // Never re-validates/re-fetches the coupon row at fulfillment time.
  assert.doesNotMatch(fn, /select \* into v_coupon from (public\.)?coupons/);
});

test("public.place_paid_order rolls up each bucket's own orders.discount_amount_egp/coupon_code from the sum of its own items' coupon shares", () => {
  const fn = migration.match(/create or replace function public\.place_paid_order\(p_payment_attempt_id uuid\)[\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /v_bucket_discount_egp := v_bucket_discount_egp \+ v_item_coupon_discount;/);
  assert.match(
    fn,
    /coupon_code = case when v_bucket_discount_egp > 0 then v_coupon_code else null end,\s*\n\s*discount_amount_egp = v_bucket_discount_egp/
  );
});

test("public.place_paid_order increments coupons.used_count exactly once per payment attempt, guarded against double-counting on a webhook retry", () => {
  const fn = migration.match(/create or replace function public\.place_paid_order\(p_payment_attempt_id uuid\)[\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /select exists \(\s*\n\s*select 1 from private\.payment_attempt_fulfillments\s*\n\s*where payment_attempt_id = p_payment_attempt_id and status = 'fulfilled'\s*\n\s*\) into v_had_prior_fulfillment;/);
  assert.match(
    fn,
    /if v_coupon_code is not null and v_any_fulfilled and not v_had_prior_fulfillment then\s*\n\s*update public\.coupons set used_count = used_count \+ 1 where code = v_coupon_code;/
  );
});

test("both rewritten functions keep their original security definer/search_path lock and service_role-only grant", () => {
  assert.match(migration, /create or replace function private\.place_order\(/);
  const privateFn = migration.match(/create or replace function private\.place_order\([\s\S]*?security definer set search_path = public/i);
  assert.ok(privateFn);

  assert.match(
    migration,
    /create or replace function public\.place_paid_order\(p_payment_attempt_id uuid\)\s*\nreturns jsonb\s*\nlanguage plpgsql\s*\nsecurity definer\s*\nset search_path = ''/
  );
  assert.match(
    migration,
    /revoke all on function public\.place_paid_order\(uuid\) from public, anon, authenticated;\s*\ngrant execute on function public\.place_paid_order\(uuid\) to service_role;/
  );
});

test("lib/pricing.ts's getVariantEffectivePrice additively returns base/source alongside the existing price/active/percent fields", () => {
  const src = read("lib/pricing.ts");
  assert.match(src, /base: number; source: "product_discount" \| "variant_discount" \| "none"/);
});

test("the COD order route (app/api/orders/route.ts) sends the pricing snapshot into p_items, computed server-side from the live product/variant, never trusting the browser", () => {
  const route = read("app/api/orders/route.ts");
  assert.match(route, /original_unit_price: effective\.base,/);
  assert.match(route, /discount_percent_snapshot: effective\.source === "none" \? null : \(effective\.percent \?\? null\),/);
  assert.match(route, /discount_source: effective\.source,/);
});

test("the Brand Portal order data layer (lib/data/brandPortal.ts) exposes the pricing snapshot per item, and derives brand-scoped discount totals only from this brand's own items — never orders.subtotal_egp/discount_amount_egp directly", () => {
  const src = read("lib/data/brandPortal.ts");
  assert.match(src, /original_unit_price, discount_percent_snapshot, discount_source, item_coupon_discount_egp/);
  assert.match(src, /brandProductsSubtotalEgp/);
  assert.match(src, /brandDiscountEgp/);
  // Never selects orders.discount_amount_egp/subtotal_egp at all — a pool
  // order's own aggregate could include another brand's totals.
  assert.doesNotMatch(src, /orders\.discount_amount_egp/);
  assert.doesNotMatch(src, /orders\(id, order_number,[\s\S]*?discount_amount_egp/);
});

test("the admin order data layer (lib/data/admin.ts) maps the same four snapshot fields onto OrderItemRecord — Admin is allowed to see order-wide totals directly, unlike Brand Portal", () => {
  const src = read("lib/data/admin.ts");
  assert.match(src, /originalUnitPrice: item\.original_unit_price != null \? Number\(item\.original_unit_price\) : null,/);
  assert.match(src, /discountPercentSnapshot: item\.discount_percent_snapshot != null \? Number\(item\.discount_percent_snapshot\) : null,/);
  assert.match(src, /discountSource: item\.discount_source,/);
  assert.match(src, /itemCouponDiscountEgp: Number\(item\.item_coupon_discount_egp \?\? 0\),/);
});

test("getOrdersForBrand filters order_items by brand_slug — the same query that already scopes a pooled multi-brand order to only this brand's own rows, unchanged by this migration's new columns", () => {
  const src = read("lib/data/brandPortal.ts");
  assert.match(src, /\.eq\("brand_slug", brandSlug\);/);
});

test("Brand Portal item cards only show a strikethrough original price when a trusted discount snapshot exists (never for historical rows with a null snapshot)", () => {
  const page = read("app/brand-portal/orders/page.tsx");
  assert.match(
    page,
    /const showStrikethrough = item\.discountSource != null && item\.discountSource !== "none" && item\.originalUnitPrice != null;/
  );
  const summary = read("components/brand-portal/BrandOrderPricingSummary.tsx");
  assert.match(summary, /item\.originalUnitPrice \?\? item\.price/);
});

test("Admin order detail page applies the identical strikethrough rule and additionally shows the full master-order total across every shipment", () => {
  const page = read("app/admin/orders/[id]/page.tsx");
  assert.match(
    page,
    /const showStrikethrough =\s*\n\s*item\.discountSource != null && item\.discountSource !== "none" && item\.originalUnitPrice != null;/
  );
  assert.match(page, /masterOrderTotal/);
});

test("Qty × unit price is shown whenever quantity > 1, on both Brand Portal and Admin", () => {
  const brandPage = read("app/brand-portal/orders/page.tsx");
  assert.match(brandPage, /item\.quantity > 1 &&/);
  const adminPage = read("app/admin/orders/[id]/page.tsx");
  assert.match(adminPage, /item\.quantity > 1 &&/);
});

test("types/index.ts's OrderItemRecord carries the optional pricing snapshot fields, never required (historical rows have none)", () => {
  const types = read("types/index.ts");
  const recordMatch = types.match(/export interface OrderItemRecord \{[\s\S]*?\n\}/);
  assert.ok(recordMatch);
  assert.match(recordMatch![0], /originalUnitPrice\?: number \| null;/);
  assert.match(recordMatch![0], /discountPercentSnapshot\?: number \| null;/);
  assert.match(recordMatch![0], /discountSource\?: OrderItemDiscountSource \| null;/);
  assert.match(recordMatch![0], /itemCouponDiscountEgp\?: number;/);
});
