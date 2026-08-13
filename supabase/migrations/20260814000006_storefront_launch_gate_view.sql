-- ============================================================================
-- Item 4: centralizes product-launch enforcement into a single database
-- access boundary, replacing the earlier client-built-brand-id-list
-- approach (lib/data/products.ts's now-removed resolveZakhnookFulfilledBrandIds
-- + a one-off `.or()` filter that only ever covered getMarketplaceCatalogPage).
--
-- public.storefront_products is a `security_invoker = true` view over
-- `products` joined to `brands` for `fulfillment_mode`, adding exactly one
-- extra condition on top of whatever RLS/grants already govern `products`:
-- a zakhnook_fulfilled brand's product is excluded until first_stocked_at
-- is set. Because it's security_invoker, the EXISTING "Public can read
-- published products" RLS policy on `products` (status/paused_by_brand/
-- publish_date/brand.is_active) still applies exactly as before, as the
-- querying role — this view adds to that, it never replaces or duplicates
-- it, so there's no drift risk if that policy's logic changes later.
--
-- Because it's a plain WHERE clause (not an RLS policy), the launch-gate
-- condition applies even to service_role queries (which bypass RLS
-- entirely) — this is what gives checkout/cart-validation code (which
-- always queries via the service-role client) real defense in depth here,
-- not just the anon-key storefront.
--
-- Exposes exactly the same column list as lib/data/products.ts's
-- PRODUCT_PUBLIC_SELECT (kept in sync deliberately, see that file), plus
-- first_stocked_at — never `select p.*`, since anon/authenticated only
-- have column-level grants on that same public subset of `products`
-- (see 20260810000004_rls_and_column_privacy_boundaries.sql) and a
-- security_invoker view queried by those roles needs equivalent per-column
-- privilege on the underlying table for whatever it reads, including
-- columns used only in the WHERE clause — which is also why this migration
-- explicitly grants the two new columns it introduces
-- (products.first_stocked_at, brands.fulfillment_mode) to anon/authenticated
-- below, extending that same allowlist rather than working around it.
-- ============================================================================

grant select (first_stocked_at) on public.products to anon, authenticated;
grant select (fulfillment_mode) on public.brands to anon, authenticated;

create or replace view public.storefront_products
with (security_invoker = true)
as
select
  p.id, p.name, p.brand_name, p.brand_slug, p.brand_id, p.product_type_id, p.audience, p.collection_id,
  p.material, p.materials, p.fit, p.price, p.discount_percent, p.discount_ends_at,
  p.currency, p.image, p.images, p.rating, p.review_count, p.description, p.details,
  p.care_instructions, p.shipping_returns, p.model_height, p.model_wearing, p.sku,
  p.is_new, p.featured, p.status, p.publish_date, p.paused_by_brand,
  p.default_low_stock_threshold, p.created_at, p.first_stocked_at
from public.products p
join public.brands b on b.id = p.brand_id
where b.fulfillment_mode <> 'zakhnook_fulfilled' or p.first_stocked_at is not null;

grant select on public.storefront_products to anon, authenticated, service_role;
