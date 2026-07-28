-- ============================================================================
-- BRAND IDENTITY (brand_id) — introduces brands.id as the real relational
-- key for ownership/authorization/FK integrity. brands.slug remains the
-- primary key (routing/URLs/SEO depend on it throughout the app and stays
-- untouched) — id is added as a second, independently-unique column that
-- every new FK below points at instead of slug.
-- ============================================================================
alter table brands add column if not exists id uuid not null default gen_random_uuid();
alter table brands drop constraint if exists brands_id_key;
alter table brands add constraint brands_id_key unique (id);
create index if not exists idx_brands_id on brands (id);

-- "Active status", required by the brand creation spec — an inactive
-- brand cannot generate a SKU (see next_product_sku in the following
-- migration) or be selected as the brand for a new product.
alter table brands add column if not exists is_active boolean not null default true;

-- ============================================================================
-- PRODUCTS.BRAND_ID — the real ownership FK. RESTRICT (not SET NULL, unlike
-- the legacy brand_slug column): once brand_id becomes NOT NULL (final
-- constraints migration, after the reset), a brand can never be deleted
-- out from under products that still reference it.
-- ============================================================================
alter table products add column if not exists brand_id uuid references brands(id) on delete restrict;
create index if not exists idx_products_brand_id on products (brand_id);

-- brand_slug on products stays as a denormalized mirror for public
-- display/linking (used across ~50 storefront/mobile files to link a
-- product back to its brand page) — but it is no longer independently
-- writable. This trigger derives it (and brand_name) from brand_id on
-- every insert/update, so the two columns can never disagree and no API
-- route needs to duplicate the lookup itself.
create or replace function public.sync_product_brand_denormalized_fields()
returns trigger
language plpgsql
as $$
declare
  v_slug text;
  v_name text;
begin
  if new.brand_id is null then
    raise exception 'products.brand_id is required';
  end if;

  select slug, name into v_slug, v_name from brands where id = new.brand_id;
  if v_slug is null then
    raise exception 'brand_id % does not reference an existing brand', new.brand_id;
  end if;

  new.brand_slug := v_slug;
  new.brand_name := v_name;
  return new;
end;
$$;

drop trigger if exists trigger_sync_product_brand_denormalized_fields on products;
create trigger trigger_sync_product_brand_denormalized_fields
  before insert or update of brand_id on products
  for each row execute function public.sync_product_brand_denormalized_fields();

-- ============================================================================
-- BRAND_STAFF — "brand memberships" per the normalization spec: switches
-- from brand_slug to brand_id as its real relational key. The table is
-- empty in the live dev database, so this is a straight column swap, not a
-- backfill-then-migrate.
-- ============================================================================
alter table brand_staff add column if not exists brand_id uuid references brands(id) on delete cascade;
update brand_staff bs set brand_id = b.id
  from brands b
  where bs.brand_slug = b.slug and bs.brand_id is null;
alter table brand_staff alter column brand_id set not null;
alter table brand_staff drop constraint if exists brand_staff_brand_slug_user_id_key;
alter table brand_staff drop constraint if exists brand_staff_brand_slug_fkey;

-- ============================================================================
-- Three live RLS policies (products, product_variants, review_replies —
-- all from supabase/schema.sql / 20260726000003_reviews_system.sql) join
-- against brand_staff.brand_slug, which is about to be dropped below.
-- Discovered only by actually running this migration against the live
-- database (2BP01: cannot drop column brand_slug ... other objects
-- depend on it) — Postgres refuses a bare DROP COLUMN here, and CASCADE
-- would silently delete these policies rather than fix them, leaving
-- brand owners/assistants unable to read their own products/variants/
-- replies. Rewritten here to join through brand_staff.brand_id instead,
-- before the column drop, so nothing is ever actually broken.
-- ============================================================================
drop policy if exists "Brand members can read their products" on public.products;
create policy "Brand members can read their products"
  on public.products for select
  to authenticated
  using (
    brand_id in (
      select b.id from public.brands b where b.owner_user_id = auth.uid()
    )
    or brand_id in (
      select bs.brand_id from public.brand_staff bs where bs.user_id = auth.uid()
    )
  );

drop policy if exists "Brand members can read their product variants" on public.product_variants;
create policy "Brand members can read their product variants"
  on public.product_variants for select
  to authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_variants.product_id
        and (
          p.brand_id in (
            select b.id from public.brands b where b.owner_user_id = auth.uid()
          )
          or p.brand_id in (
            select bs.brand_id from public.brand_staff bs where bs.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "Brand members manage own replies" on public.review_replies;
create policy "Brand members manage own replies" on public.review_replies for all to authenticated
using (
  exists (select 1 from public.brands b where b.slug=brand_slug and b.owner_user_id=(select auth.uid()))
  or exists (
    select 1 from public.brand_staff s
    join public.brands b on b.id = s.brand_id
    where b.slug = review_replies.brand_slug and s.user_id = (select auth.uid())
  )
)
with check (
  replied_by=(select auth.uid())
  and exists (
    select 1 from public.reviews r join public.products p on p.id=r.product_id
    where r.id=review_id and p.brand_slug=brand_slug
  )
  and (
    exists (select 1 from public.brands b where b.slug=brand_slug and b.owner_user_id=(select auth.uid()))
    or exists (
      select 1 from public.brand_staff s
      join public.brands b on b.id = s.brand_id
      where b.slug = review_replies.brand_slug and s.user_id = (select auth.uid())
    )
  )
);

alter table brand_staff drop column if exists brand_slug;
alter table brand_staff drop constraint if exists brand_staff_brand_id_user_id_key;
alter table brand_staff add constraint brand_staff_brand_id_user_id_key unique (brand_id, user_id);

-- ============================================================================
-- set_user_access() (supabase/schema.sql) inserts into brand_staff by
-- brand_slug — same discovery as the policies above. Its own parameter
-- stays p_brand_slug (the admin Users page picks a brand by slug), but it
-- now resolves that to brand_id before writing, since brand_staff no
-- longer has a brand_slug column at all.
-- ============================================================================
create or replace function public.set_user_access(
  p_user_id uuid,
  p_access text,
  p_brand_slug text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean;
  v_brand_id uuid;
begin
  if p_access not in ('customer', 'brand_owner', 'brand_assistant', 'staff', 'manager', 'admin') then
    raise exception 'Invalid access level';
  end if;
  if p_access in ('brand_owner', 'brand_assistant') and nullif(p_brand_slug, '') is null then
    raise exception 'A brand is required for this access level';
  end if;
  if p_access in ('brand_owner', 'brand_assistant') then
    select id into v_brand_id from public.brands where slug = p_brand_slug;
    if v_brand_id is null then
      raise exception 'Brand not found';
    end if;
  end if;

  update public.brands set owner_user_id = null
  where owner_user_id = p_user_id
    and (p_access <> 'brand_owner' or slug <> p_brand_slug);
  if p_access = 'brand_owner' then
    update public.brands set owner_user_id = p_user_id where slug = p_brand_slug;
  end if;

  delete from public.brand_staff where user_id = p_user_id;
  if p_access = 'brand_assistant' then
    insert into public.brand_staff (brand_id, user_id)
    values (v_brand_id, p_user_id)
    on conflict (brand_id, user_id) do nothing;
  end if;

  v_is_admin := p_access in ('staff', 'manager', 'admin');
  update public.profiles set is_admin = v_is_admin, role = p_access where id = p_user_id;
  if not found then raise exception 'User profile not found'; end if;
end;
$$;

revoke all on function public.set_user_access(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.set_user_access(uuid, text, text)
  to service_role;
