-- Brand-scoped, server-generated, immutable Product SKU + brand-owned
-- Collections — both additive. Nothing here changes an existing product's
-- current `sku` or `collection` (free-text) value; new products going
-- forward use the new mechanisms via the API routes.

-- ============================================================================
-- BRAND SKU PREFIX — admin-managed, required before a brand can create a
-- product through the new SKU generation path.
-- ============================================================================
alter table brands add column if not exists sku_prefix text;
alter table brands drop constraint if exists brands_sku_prefix_format_check;
alter table brands add constraint brands_sku_prefix_format_check
  check (sku_prefix is null or sku_prefix ~ '^[A-Z0-9]{2,6}$');
create unique index if not exists brands_sku_prefix_key on brands (sku_prefix) where sku_prefix is not null;

-- ============================================================================
-- BRAND_SKU_COUNTERS — one row per brand, incremented atomically by
-- next_product_sku() below. A plain UPDATE/INSERT ... ON CONFLICT with
-- RETURNING is row-locked by Postgres, so two concurrent product creations
-- for the same brand can never read the same last_value — no count(*)+1,
-- no application-level locking needed.
-- ============================================================================
create table if not exists brand_sku_counters (
  brand_slug text primary key references brands (slug) on delete cascade,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.next_product_sku(p_brand_slug text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_prefix text;
  v_next bigint;
begin
  select sku_prefix into v_prefix from brands where slug = p_brand_slug;
  if v_prefix is null then
    raise exception 'Brand % has no sku_prefix configured — an admin must set one before this brand can create products', p_brand_slug;
  end if;

  insert into brand_sku_counters (brand_slug, last_value)
  values (p_brand_slug, 1)
  on conflict (brand_slug) do update
    set last_value = brand_sku_counters.last_value + 1,
        updated_at = now()
  returning last_value into v_next;

  return v_prefix || '-' || lpad(v_next::text, 6, '0');
end;
$$;

revoke all on function public.next_product_sku(text) from public;
revoke all on function public.next_product_sku(text) from anon, authenticated;

-- ============================================================================
-- COLLECTIONS — brand-owned, replaces the old global free-text
-- `products.collection` value going forward. That column is left in place
-- untouched (nothing currently reads/writes it once the rebuilt form ships,
-- but no existing product's stored value is touched or lost).
-- ============================================================================
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null references brands (slug) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  cover_image_url text,
  is_active boolean not null default true,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_slug, slug)
);

create index if not exists idx_collections_brand_slug on collections (brand_slug);
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
-- PRODUCTS — reference a collection by id, scoped to the product's own brand.
-- ============================================================================
alter table products add column if not exists collection_id uuid references collections (id) on delete set null;
create index if not exists idx_products_collection_id on products (collection_id);
