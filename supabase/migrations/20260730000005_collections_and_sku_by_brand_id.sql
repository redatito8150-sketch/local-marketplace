-- ============================================================================
-- BRAND SKU PREFIX — admin-managed, required before a brand can create a
-- product. Locking (once a brand has >=1 product) is enforced by the
-- trigger further below.
-- ============================================================================
alter table brands add column if not exists sku_prefix text;
alter table brands drop constraint if exists brands_sku_prefix_format_check;
alter table brands add constraint brands_sku_prefix_format_check
  check (sku_prefix is null or sku_prefix ~ '^[A-Z0-9]{2,6}$');
create unique index if not exists brands_sku_prefix_key on brands (sku_prefix) where sku_prefix is not null;

create or replace function public.enforce_sku_prefix_immutable_after_products()
returns trigger
language plpgsql
as $$
begin
  if new.sku_prefix is distinct from old.sku_prefix
     and exists (select 1 from products where brand_id = old.id) then
    raise exception 'SKU prefix cannot be changed after products have been created.';
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_enforce_sku_prefix_immutable on brands;
create trigger trigger_enforce_sku_prefix_immutable
  before update of sku_prefix on brands
  for each row execute function public.enforce_sku_prefix_immutable_after_products();

-- ============================================================================
-- BRAND_SKU_COUNTERS — one row per brand (by id, not slug), incremented
-- atomically by next_product_sku() below. INSERT ... ON CONFLICT ...
-- RETURNING is row-locked by Postgres, so two concurrent product creations
-- for the same brand can never read the same last_value — no count(*)+1,
-- no application-level locking needed, and no number reuse after a
-- product is later deleted (the counter only ever increases).
-- ============================================================================
create table if not exists brand_sku_counters (
  brand_id uuid primary key references brands (id) on delete cascade,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.next_product_sku(p_brand_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_prefix text;
  v_is_active boolean;
  v_next bigint;
begin
  select sku_prefix, is_active into v_prefix, v_is_active
  from brands where id = p_brand_id;

  if not found then
    raise exception 'Brand % does not exist', p_brand_id;
  end if;
  if not v_is_active then
    raise exception 'Brand % is not active', p_brand_id;
  end if;
  if v_prefix is null then
    raise exception 'Brand % has no sku_prefix configured — an admin must set one before this brand can create products', p_brand_id;
  end if;

  insert into brand_sku_counters (brand_id, last_value)
  values (p_brand_id, 1)
  on conflict (brand_id) do update
    set last_value = brand_sku_counters.last_value + 1,
        updated_at = now()
  returning last_value into v_next;

  return v_prefix || '-' || lpad(v_next::text, 6, '0');
end;
$$;

revoke all on function public.next_product_sku(uuid) from public;
revoke all on function public.next_product_sku(uuid) from anon, authenticated;

-- Drop the old brand_slug-keyed overload, if it was ever created live
-- (it was not, in this environment — this repo's copy of that migration
-- was rewritten in place before ever being applied — but this keeps the
-- file correct/idempotent for any environment where it was).
drop function if exists public.next_product_sku(text);

-- ============================================================================
-- COLLECTIONS — brand-owned, keyed by brand_id (not brand_slug). Public
-- collection pages resolve the brand by its URL slug first, then query
-- collections by the resolved brand's id — collections itself never needs
-- to store a brand slug.
-- ============================================================================
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  cover_image_url text,
  is_active boolean not null default true,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create index if not exists idx_collections_brand_id on collections (brand_id);
create index if not exists idx_collections_is_active on collections (is_active);

create or replace function public.set_collection_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_collections_updated_at on collections;
create trigger trigger_collections_updated_at
  before update on collections
  for each row execute function public.set_collection_updated_at();

alter table collections enable row level security;
drop policy if exists "Published active collections are publicly readable" on collections;
create policy "Published active collections are publicly readable"
  on collections for select
  using (is_active = true and published_at is not null);
-- No public insert/update/delete policy — brand owners and admins manage
-- collections exclusively through the service-role API routes
-- (app/api/brand-portal/collections, app/api/admin/collections), which
-- enforce brand ownership explicitly before writing.

-- ============================================================================
-- PRODUCTS.COLLECTION_ID — a product's collection, scoped to its own
-- brand. The trigger below is the database-level guard preventing a
-- cross-brand assignment (a collection belonging to brand A being set on
-- a product owned by brand B) — this must never be enforced by
-- application code alone.
-- ============================================================================
alter table products add column if not exists collection_id uuid references collections (id) on delete set null;
create index if not exists idx_products_collection_id on products (collection_id);

create or replace function public.enforce_product_collection_brand_match()
returns trigger
language plpgsql
as $$
declare
  v_collection_brand_id uuid;
begin
  if new.collection_id is null then
    return new;
  end if;

  select brand_id into v_collection_brand_id from collections where id = new.collection_id;
  if v_collection_brand_id is null then
    raise exception 'collection_id % does not reference an existing collection', new.collection_id;
  end if;
  if v_collection_brand_id is distinct from new.brand_id then
    raise exception 'collection % belongs to a different brand than product brand_id %', new.collection_id, new.brand_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_enforce_product_collection_brand_match on products;
create trigger trigger_enforce_product_collection_brand_match
  before insert or update of collection_id, brand_id on products
  for each row execute function public.enforce_product_collection_brand_match();
