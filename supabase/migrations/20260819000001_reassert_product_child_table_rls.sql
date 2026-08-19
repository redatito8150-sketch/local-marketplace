-- Live regression check (tests/security.rls.test.ts, "product child tables
-- ... do not leak non-published/paused product data to the anon key") found
-- that the anon key can currently read product_options rows belonging to
-- Archived products against the live project, even though
-- 20260804000001_scope_product_child_table_rls.sql already contains the
-- correct restrictive policy text for product_options, product_option_values,
-- product_variant_values, and product_color_images.
--
-- The migration history itself has no later change that touches these
-- policies (confirmed by grep across every subsequent migration file), so
-- the live database's actual policy state has drifted from what this repo's
-- migration history says it should be — the same class of drift already
-- flagged for schema.sql in docs/security-audit.md (SEC-009), just found
-- here for the first time on an actual RLS policy rather than the dump file.
--
-- Fix: idempotently re-assert the exact same policy definitions from
-- 20260804000001 (drop-if-exists + create), so applying this migration
-- brings the live project into the correct state regardless of why the
-- original migration's effect isn't present today. No schema/table change,
-- SELECT-only policies, safe to replay on any environment.

-- product_options ------------------------------------------------------
drop policy if exists "Public can read product options" on public.product_options;
drop policy if exists "Public reads product options for published products" on public.product_options;

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

-- product_option_values --------------------------------------------------
drop policy if exists "Public can read product option values" on public.product_option_values;
drop policy if exists "Public reads product option values for published products" on public.product_option_values;

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

-- product_variant_values --------------------------------------------------
drop policy if exists "Public can read product variant values" on public.product_variant_values;
drop policy if exists "Public reads product variant values for published products" on public.product_variant_values;

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

-- product_color_images --------------------------------------------------
drop policy if exists "Public can read product color images" on public.product_color_images;
drop policy if exists "Public reads product color images for published products" on public.product_color_images;

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

-- Brand-staff read access to their own (including Draft/Archived)
-- products' option/variant/color-image data — re-asserted for the same
-- reason as the public policies above, matching 20260804000001 exactly.
drop policy if exists "Brand members read own product options" on public.product_options;
create policy "Brand members read own product options"
  on public.product_options for select
  to authenticated
  using (
    exists (
      select 1 from public.products p
      join public.brand_staff bs on bs.brand_id = p.brand_id
      where p.id = product_options.product_id
        and bs.user_id = (select auth.uid())
    )
  );

drop policy if exists "Brand members read own product option values" on public.product_option_values;
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
        and bs.user_id = (select auth.uid())
    )
  );

drop policy if exists "Brand members read own product variant values" on public.product_variant_values;
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
        and bs.user_id = (select auth.uid())
    )
  );

drop policy if exists "Brand members read own product color images" on public.product_color_images;
create policy "Brand members read own product color images"
  on public.product_color_images for select
  to authenticated
  using (
    exists (
      select 1 from public.products p
      join public.brand_staff bs on bs.brand_id = p.brand_id
      where p.id = product_color_images.product_id
        and bs.user_id = (select auth.uid())
    )
  );
