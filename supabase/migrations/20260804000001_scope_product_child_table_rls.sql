-- Security fix (audit/security-and-repository-organization, finding RLS-016):
--
-- product_options, product_option_values, product_variant_values, and
-- product_color_images were created in
-- 20260731000002_product_options_and_variant_values.sql with an
-- unconditional `using (true)` public SELECT policy. That is the exact
-- pattern already identified and fixed for the sibling `products` table
-- (SEC-003 / RLS-001, see docs/security-audit.md) and later correctly
-- applied to `product_variants` (20260722101910_security_boundaries.sql)
-- and `product_media` (20260801000001_inventory_variants_refinement.sql)
-- — but these four tables were missed by both of those follow-up passes.
--
-- Impact: any client using only the public anon key (i.e. bypassing the
-- app's own server-side product-status filtering entirely, by calling the
-- Supabase REST/JS API directly) can read a Draft, Archived, or
-- brand-paused product's option/variant structure and color image URLs
-- — including unreleased-product photography — even though the parent
-- `products` row itself is correctly hidden.
--
-- Fix: replace the public policy on each of the four tables with the same
-- "published and not paused-by-brand" predicate used for
-- `product_variants`, and add an authenticated brand-staff policy so
-- brand-portal editors keep full read access to their own (including
-- Draft) products' option/variant/color-image data. Admin/service-role
-- reads are unaffected — they already go through `supabaseAdmin`, which
-- bypasses RLS entirely.

-- product_options ------------------------------------------------------
drop policy if exists "Public can read product options" on public.product_options;

create policy "Public reads product options for published products"
  on public.product_options for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_options.product_id
        and p.status = 'published'
        and coalesce(p.paused_by_brand, false) = false
    )
  );

create policy "Brand members read own product options"
  on public.product_options for select
  to authenticated
  using (
    exists (
      select 1 from public.products p
      join public.brand_staff bs on bs.brand_id = p.brand_id
      where p.id = product_options.product_id
        and bs.user_id = auth.uid()
    )
  );

-- product_option_values --------------------------------------------------
drop policy if exists "Public can read product option values" on public.product_option_values;

create policy "Public reads product option values for published products"
  on public.product_option_values for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.product_options po
      join public.products p on p.id = po.product_id
      where po.id = product_option_values.product_option_id
        and p.status = 'published'
        and coalesce(p.paused_by_brand, false) = false
    )
  );

create policy "Brand members read own product option values"
  on public.product_option_values for select
  to authenticated
  using (
    exists (
      select 1
      from public.product_options po
      join public.products p on p.id = po.product_id
      join public.brand_staff bs on bs.brand_id = p.brand_id
      where po.id = product_option_values.product_option_id
        and bs.user_id = auth.uid()
    )
  );

-- product_variant_values --------------------------------------------------
drop policy if exists "Public can read product variant values" on public.product_variant_values;

create policy "Public reads product variant values for published products"
  on public.product_variant_values for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.id = product_variant_values.variant_id
        and p.status = 'published'
        and coalesce(p.paused_by_brand, false) = false
    )
  );

create policy "Brand members read own product variant values"
  on public.product_variant_values for select
  to authenticated
  using (
    exists (
      select 1
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      join public.brand_staff bs on bs.brand_id = p.brand_id
      where pv.id = product_variant_values.variant_id
        and bs.user_id = auth.uid()
    )
  );

-- product_color_images --------------------------------------------------
drop policy if exists "Public can read product color images" on public.product_color_images;

create policy "Public reads product color images for published products"
  on public.product_color_images for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.products p
      where p.id = product_color_images.product_id
        and p.status = 'published'
        and coalesce(p.paused_by_brand, false) = false
    )
  );

create policy "Brand members read own product color images"
  on public.product_color_images for select
  to authenticated
  using (
    exists (
      select 1 from public.products p
      join public.brand_staff bs on bs.brand_id = p.brand_id
      where p.id = product_color_images.product_id
        and bs.user_id = auth.uid()
    )
  );
