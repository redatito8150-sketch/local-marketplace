-- ============================================================================
-- Item 4 (original corrective pass): centralizes product-launch enforcement
-- into a single database access boundary, replacing the earlier
-- client-built-brand-id-list approach (lib/data/products.ts's now-removed
-- resolveZakhnookFulfilledBrandIds + a one-off `.or()` filter that only
-- ever covered getMarketplaceCatalogPage).
--
-- SECOND CORRECTIVE PASS — items 1 and 2:
--
-- A security_invoker VIEW is not an access boundary on its own: any
-- anon/authenticated client can simply query `products` directly (the
-- storefront's own public anon key can do this trivially) and the
-- ORIGINAL "Public can read published products" RLS policy — which never
-- checked fulfillment_mode/first_stocked_at at all — would still hand back
-- every unlaunched zakhnook_fulfilled product. The real access boundary
-- has to be the RLS policy on `products` itself. This migration
-- re-declares that policy (drop + create, the same pattern the migration
-- that first defined it already uses) adding the full gate — launch state
-- AND no open fulfillment transition — directly into its `using()` clause.
-- A `using()` predicate is evaluated with the policy's own elevated
-- internal privilege, not the querying role's column grants, so this adds
-- no new column exposure; no sensitive column is added to what
-- anon/authenticated can SELECT.
--
-- The full gate (not just launch state) belongs in the true access
-- boundary because of the exact race the audit flagged: a
-- brand_fulfilled -> zakhnook_fulfilled transition's first accepted
-- receipt sets first_stocked_at (satisfying the launch condition alone)
-- and raises product_variants.quantity, but fulfillment_mode/
-- is_mahaly_partner don't flip until activation — checkout already
-- refuses to sell that stock during this window (see
-- 20260814000005_inventory_permission_boundaries.sql's place_order/
-- place_paid_order guard), so the storefront/cart must refuse to *show*
-- it as available too, not just launch-gate it.
--
-- public.storefront_products keeps the identical full condition as a
-- plain WHERE clause (not an RLS policy), which is what gives
-- service-role checkout/cart-validation code (which bypasses RLS
-- entirely) the same defense in depth — RLS alone would leave
-- service-role reads completely unguarded by this gate.
-- ============================================================================

grant select (first_stocked_at) on public.products to anon, authenticated;
grant select (fulfillment_mode) on public.brands to anon, authenticated;

-- Shared by the RLS policy's using() clause and the view's WHERE clause
-- below, so the two can never drift out of sync with each other — the
-- exact bug class this second corrective pass exists to close.
--
-- SECURITY DEFINER is required here, not optional: brand_fulfillment_transitions
-- has no public read policy (only brand owner/staff/admin can see their own
-- rows via RLS) — an ordinary customer session evaluating this as a plain
-- invoker function would have every transition row silently filtered out
-- by THAT table's own RLS, making the "no open transition" check always
-- true and defeating the whole exclusion. Running as the (trusted) definer
-- bypasses that inner RLS so the check sees the real state, while only
-- ever returning a single boolean — no transition row data is exposed to
-- the caller either way. EXECUTE must stay grantable to anon/authenticated
-- (unlike this migration's other private helpers) because the RLS policy
-- below needs to invoke it as those roles; the narrow boolean-only return
-- shape is what keeps that safe.
create or replace function private.is_product_storefront_launch_gated(p_brand_id uuid, p_first_stocked_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      not exists (
        select 1 from public.brands b
        where b.id = p_brand_id and b.fulfillment_mode = 'zakhnook_fulfilled'
      )
      or p_first_stocked_at is not null
    )
    and not exists (
      select 1 from public.brand_fulfillment_transitions bft
      where bft.brand_id = p_brand_id
        and bft.status not in ('completed', 'cancelled', 'failed')
    );
$$;

revoke all on function private.is_product_storefront_launch_gated(uuid, timestamptz) from public;
grant execute on function private.is_product_storefront_launch_gated(uuid, timestamptz)
  to anon, authenticated, service_role;

drop policy if exists "Public can read published products" on public.products;
create policy "Public can read published products"
  on public.products for select
  to anon, authenticated
  using (
    status = 'published'
    and coalesce(paused_by_brand, false) = false
    and (publish_date is null or publish_date <= now())
    and exists (
      select 1 from public.brands b
      where b.id = products.brand_id and b.is_active = true
    )
    and private.is_product_storefront_launch_gated(products.brand_id, products.first_stocked_at)
  );

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
where private.is_product_storefront_launch_gated(p.brand_id, p.first_stocked_at);

grant select on public.storefront_products to anon, authenticated, service_role;
