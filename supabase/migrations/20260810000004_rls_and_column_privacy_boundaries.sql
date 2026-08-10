-- Row policies are not column-security boundaries. This migration replaces
-- broad table SELECT grants with explicit storefront/portal projections and
-- makes brand membership authoritative for order visibility.

-- ---------------------------------------------------------------------------
-- Brand membership and inactive-brand visibility
-- ---------------------------------------------------------------------------
drop policy if exists "Public can read brands" on public.brands;
drop policy if exists "Anyone can read brands" on public.brands;
create policy "Public can read active brands"
  on public.brands for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Brand members can read managed brands" on public.brands;
create policy "Brand members can read managed brands"
  on public.brands for select
  to authenticated
  using (
    owner_user_id = (select auth.uid())
    or exists (
      select 1
      from public.brand_staff membership
      where membership.brand_id = brands.id
        and membership.user_id = (select auth.uid())
    )
  );

revoke select on public.brands from anon, authenticated;
do $migration$
declare
  public_columns text;
begin
  select string_agg(format('%I', requested.column_name), ', ' order by requested.ordinality)
  into public_columns
  from unnest(array[
    'id', 'slug', 'name', 'tagline', 'category', 'additional_categories', 'founded_year',
    'city', 'hero_image', 'logo_image', 'about_description', 'about_image', 'story_image',
    'story_image_2', 'story_body', 'website_url', 'shop_the_look', 'info_badges',
    'category_tabs', 'active_tab', 'values', 'similar_brand_slugs', 'created_at',
    'is_active', 'is_mahaly_partner', 'is_sponsored', 'sponsored_placements',
    'sponsored_order', 'shipping_policy', 'return_policy', 'return_window_days',
    'founder_name', 'journey_milestones', 'about_headline', 'about_quote', 'founder_names',
    'founders', 'collections_page_title', 'collections_detail_eyebrow',
    'collections_detail_heading'
  ]::text[]) with ordinality as requested(column_name, ordinality)
  where exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.brands'::regclass
      and attribute.attname = requested.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped
  );

  if public_columns is null then
    raise exception 'public.brands has none of the expected storefront columns';
  end if;

  execute format(
    'grant select (%s) on public.brands to anon, authenticated',
    public_columns
  );
end
$migration$;

create or replace function public.get_my_brand_edit_metadata(p_brand_slug text)
returns table(deleted_image_backups jsonb, source_application_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select b.deleted_image_backups, b.source_application_id
  from public.brands b
  where b.slug = p_brand_slug
    and (
      b.owner_user_id = (select auth.uid())
      or exists (
        select 1
        from public.brand_staff membership
        where membership.brand_id = b.id
          and membership.user_id = (select auth.uid())
      )
    );
$$;
revoke all on function public.get_my_brand_edit_metadata(text) from public;
grant execute on function public.get_my_brand_edit_metadata(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storefront product visibility and column privacy
-- ---------------------------------------------------------------------------
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
  );

revoke select on public.products from anon, authenticated;
do $migration$
declare
  public_columns text;
begin
  select string_agg(format('%I', requested.column_name), ', ' order by requested.ordinality)
  into public_columns
  from unnest(array[
    'id', 'name', 'brand_name', 'brand_slug', 'brand_id', 'product_type_id', 'audience', 'collection_id',
    'material', 'materials', 'fit', 'price', 'discount_percent', 'discount_ends_at',
    'currency', 'image', 'images', 'rating', 'review_count', 'description', 'details',
    'care_instructions', 'shipping_returns', 'model_height', 'model_wearing', 'sku',
    'is_new', 'featured', 'status', 'publish_date', 'paused_by_brand',
    'default_low_stock_threshold', 'created_at'
  ]::text[]) with ordinality as requested(column_name, ordinality)
  where exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.products'::regclass
      and attribute.attname = requested.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped
  );

  if public_columns is null then
    raise exception 'public.products has none of the expected storefront columns';
  end if;

  execute format(
    'grant select (%s) on public.products to anon, authenticated',
    public_columns
  );
end
$migration$;

-- ---------------------------------------------------------------------------
-- Orders: co-owner access without base-row PII/internal-note disclosure
-- ---------------------------------------------------------------------------
create or replace function public.brand_owns_order_item(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.order_items oi
    join public.brands b on b.slug = oi.brand_slug
    where oi.order_id = p_order_id
      and (
        b.owner_user_id = (select auth.uid())
        or exists (
          select 1
          from public.brand_staff membership
          where membership.brand_id = b.id
            and membership.user_id = (select auth.uid())
        )
      )
  );
$$;
revoke all on function public.brand_owns_order_item(uuid) from public, anon;
grant execute on function public.brand_owns_order_item(uuid) to authenticated, service_role;

drop policy if exists "Brand owners can read their own order items" on public.order_items;
create policy "Brand members can read their own order items"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.brands b
      where b.slug = order_items.brand_slug
        and (
          b.owner_user_id = (select auth.uid())
          or exists (
            select 1
            from public.brand_staff membership
            where membership.brand_id = b.id
              and membership.user_id = (select auth.uid())
          )
        )
    )
  );

revoke select on public.orders from anon, authenticated;
do $migration$
declare
  portal_columns text;
begin
  select string_agg(format('%I', requested.column_name), ', ' order by requested.ordinality)
  into portal_columns
  from unnest(array[
    'id', 'order_number', 'status', 'shipping_name', 'shipping_city',
    'shipping_governorate', 'created_at', 'order_group_id', 'fulfillment_type',
    'brand_slug', 'shipping_fee_egp'
  ]::text[]) with ordinality as requested(column_name, ordinality)
  where exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.orders'::regclass
      and attribute.attname = requested.column_name
      and attribute.attnum > 0
      and not attribute.attisdropped
  );

  if portal_columns is null then
    raise exception 'public.orders has none of the expected portal columns';
  end if;

  execute format(
    'grant select (%s) on public.orders to authenticated',
    portal_columns
  );
end
$migration$;

-- ---------------------------------------------------------------------------
-- Review owners may edit review copy only through the authenticated API.
-- They can no longer write moderation/deletion/publication columns directly.
-- ---------------------------------------------------------------------------
revoke update on public.reviews from authenticated;

drop policy if exists "Public reads replies to public reviews" on public.review_replies;
create policy "Public reads replies to public reviews"
  on public.review_replies for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.reviews review_row
      where review_row.id = review_replies.review_id
        and review_row.status = 'published'
        and review_row.deleted_at is null
    )
  );

drop policy if exists "Brand members manage own replies" on public.review_replies;
create policy "Brand members manage own replies"
  on public.review_replies for all
  to authenticated
  using (
    exists (
      select 1
      from public.brands b
      where b.slug = review_replies.brand_slug
        and (
          b.owner_user_id = (select auth.uid())
          or exists (
            select 1 from public.brand_staff membership
            where membership.brand_id = b.id
              and membership.user_id = (select auth.uid())
          )
        )
    )
  )
  with check (
    review_replies.replied_by = (select auth.uid())
    and exists (
      select 1
      from public.reviews review_row
      join public.products product_row on product_row.id = review_row.product_id
      where review_row.id = review_replies.review_id
        and product_row.brand_slug = review_replies.brand_slug
    )
    and exists (
      select 1
      from public.brands b
      where b.slug = review_replies.brand_slug
        and (
          b.owner_user_id = (select auth.uid())
          or exists (
            select 1 from public.brand_staff membership
            where membership.brand_id = b.id
              and membership.user_id = (select auth.uid())
          )
        )
    )
  );
