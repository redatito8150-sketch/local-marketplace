-- ============================================================================
-- LOCAL marketplace — Supabase schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- ============================================================================

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ============================================================================
-- BRANDS
-- Editorial/profile content for each local brand (Marga Studio, Nola, etc.)
-- ============================================================================
create table if not exists brands (
  slug text primary key,
  name text not null,
  tagline text not null,
  category text not null,
  founded_year int,
  city text not null default 'Cairo',
  hero_image text not null,
  about_description text not null,
  about_image text not null,
  story_image text not null,
  story_body text not null,
  info_badges jsonb not null default '[]',       -- [{ icon, label }]
  category_tabs jsonb not null default '[]',      -- [{ id, label }]
  active_tab text not null default 'shop-all',
  values jsonb not null default '[]',              -- [{ icon, title, description }]
  similar_brand_slugs text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- PRODUCTS
-- Single table for both shop-category products (women/men/kids) and
-- brand-specific products (Marga Studio etc). `category` and `brand_slug`
-- are both nullable because a product belongs to one or the other (or both).
-- ============================================================================
create table if not exists products (
  id text primary key,                             -- e.g. 'w-1', 'p1'
  name text not null,
  brand_name text not null,
  brand_slug text references brands(slug) on delete set null,
  category text check (category in ('women', 'men', 'kids')),
  price numeric(10, 2) not null,
  currency text not null default 'USD' check (currency in ('USD', 'EGP')),
  image text not null,
  images text[] not null default '{}',              -- gallery, first item should match `image`
  rating numeric(2, 1) not null default 5,
  review_count int not null default 0,
  colors jsonb not null default '[]',                -- [{ name, hex }]
  sizes text[] not null default '{XS,S,M,L,XL}',
  description text not null default '',
  details text[] not null default '{}',
  care_instructions text[] not null default '{}',
  shipping_returns text not null default '',
  sku text not null,
  in_stock boolean not null default true,
  is_new boolean not null default false,
  is_unisex boolean not null default false,          -- also shows under the paired gender category (women<->men only)
  unavailable_sizes text[] not null default '{}',    -- subset of `sizes` that's currently out of stock
  created_at timestamptz not null default now()
);

create index if not exists products_category_idx on products (category);
create index if not exists products_brand_slug_idx on products (brand_slug);

-- ============================================================================
-- PROFILES
-- One row per authenticated user (mirrors auth.users, extends with app data)
-- ============================================================================
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ORDERS + ORDER ITEMS
-- ============================================================================
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'shipped', 'fulfilled', 'cancelled')),
  shipping_name text not null,
  shipping_email text not null,
  shipping_phone text not null,
  shipping_address text not null,
  shipping_city text not null,
  shipping_governorate text not null,
  subtotal_usd numeric(10, 2) not null default 0,
  subtotal_egp numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  product_id text references products (id) on delete set null,
  name text not null,
  brand text not null,
  price numeric(10, 2) not null,
  currency text not null default 'USD',
  size text not null,
  color text,
  quantity int not null default 1,
  image text not null
);

create index if not exists order_items_order_id_idx on order_items (order_id);

-- ============================================================================
-- BRAND APPLICATIONS
-- Submissions from app/join-as-a-brand/apply (app/api/join/apply/route.ts).
-- Reviewed from app/admin/applications.
-- ============================================================================
create table if not exists brand_applications (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  founder_name text not null,
  email text not null,
  phone text not null,
  instagram_or_website text not null,
  product_category text not null,
  brand_story text not null,
  sales_channels text not null,
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Products and brands are public catalog data → readable by anyone.
-- Orders/profiles are private → only the owning user (or no one, until
-- Phase 2 auth is wired up) can read their own rows.
-- ============================================================================
alter table brands enable row level security;
alter table products enable row level security;
alter table profiles enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table brand_applications enable row level security;

create policy "Public can read brands"
  on brands for select
  using (true);

create policy "Public can read products"
  on products for select
  using (true);

create policy "Users can read their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can read their own orders"
  on orders for select
  using (auth.uid() = user_id);

create policy "Users can read their own order items"
  on order_items for select
  using (
    exists (
      select 1 from orders
      where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
    )
  );

-- NOTE: There are deliberately no public INSERT policies on orders/
-- order_items. Order writes go through app/api/orders/route.ts using the
-- service_role key (lib/supabase/admin.ts), which bypasses RLS entirely —
-- never directly from the browser with the anon key. Same story for
-- brand_applications (app/api/join/apply/route.ts) — no public policies
-- at all, admin reads/writes go through the service-role client too.

-- ============================================================================
-- AUTH TRIGGER
-- Mirrors every new auth.users row into `profiles` so the "Users can read
-- their own profile" policy above has something to read. Run once, same as
-- the rest of this file, in the Supabase SQL editor.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ADMIN FLAG
-- `profiles` already exists in production, so `create table if not exists`
-- above won't retroactively add this column — this alter is what actually
-- needs to run. Gates app/admin/** (see lib/supabase/adminAuth.ts). No admin
-- UI grants/revokes this; it's set directly in the Table Editor or via a
-- one-off service-role script.
-- ============================================================================
alter table profiles add column if not exists is_admin boolean not null default false;

-- ============================================================================
-- UNISEX + PER-SIZE AVAILABILITY
-- `products` already exists in production too — same reasoning as above.
-- ============================================================================
alter table products add column if not exists is_unisex boolean not null default false;
alter table products add column if not exists unavailable_sizes text[] not null default '{}';

-- ============================================================================
-- ADMIN DASHBOARD: ORDER STATUS + BRAND APPLICATIONS
-- `orders` already exists in production, so its status check constraint
-- needs to be replaced (not just added-to) to allow 'shipped'. The default
-- constraint name below is Postgres's auto-generated name for an inline
-- check on `orders.status` — if this DROP silently no-ops because the name
-- differs, check the actual name under Table Editor → orders → Constraints
-- and adjust. `brand_applications` is a brand-new table, so plain
-- `create table if not exists` (already above) is enough to run once.
-- ============================================================================
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pending', 'paid', 'shipped', 'fulfilled', 'cancelled'));

-- ============================================================================
-- PRODUCT SYSTEM UPGRADE — PHASE 1 (variants, extended taxonomy, notifications)
-- `products` already exists in production, so these are additive
-- `alter table ... add column if not exists` statements, not a rewrite.
-- Every new column is nullable or has a safe default, so every existing
-- product row keeps working unchanged with zero variants until Phase 2's
-- admin UI actually creates variant rows for it.
-- ============================================================================
alter table products add column if not exists product_type text;
alter table products add column if not exists collection text;
alter table products add column if not exists material text;
alter table products add column if not exists fit text;
alter table products add column if not exists compare_at_price numeric(10, 2);
alter table products add column if not exists model_height text;
alter table products add column if not exists model_wearing text;
alter table products add column if not exists track_inventory boolean not null default true;
alter table products add column if not exists featured boolean not null default false;
alter table products add column if not exists status text not null default 'draft'
  check (status in ('draft', 'published', 'archived'));
alter table products add column if not exists publish_date timestamptz;

-- One row per Color+Size combination for a product. Starts empty for every
-- existing product — nothing here is populated until Phase 2's admin UI
-- creates rows, so `products.sizes`/`colors`/`unavailable_sizes`/`sku`/
-- `in_stock` keep being the source of truth for any product with zero
-- variants.
create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  color text,
  size text,
  sku text,
  quantity int not null default 0,
  low_stock_threshold int not null default 0,
  price_override numeric(10, 2),
  availability_status text not null default 'available'
    check (availability_status in ('available', 'unavailable', 'discontinued')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_variants_product_id_idx on product_variants (product_id);

alter table product_variants enable row level security;

create policy "Public can read product variants"
  on product_variants for select
  using (true);
-- No public write policy — writes go through supabaseAdmin in server-only
-- Route Handlers, same pattern as products/brands/orders.

-- In-app admin notification feed (Phase 5 uses this; the table is added
-- now alongside the rest of the schema so Phase 1 doesn't need a second
-- SQL round-trip later).
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  body text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_read_idx on notifications (read);

alter table notifications enable row level security;
-- No public policy at all — this is admin-only data, read exclusively via
-- supabaseAdmin from pages already behind requireAdminUser(), same as
-- orders/brand_applications/profiles.

-- ============================================================================
-- PRODUCT SYSTEM UPGRADE — PHASE 2 addendum
-- The new Product Form has a "Category" dropdown (e.g. Clothing/Shoes/Bags)
-- that is a different concept from the existing `products.category` column
-- (women/men/kids — relabeled "Gender" in the new form, left untouched
-- since /shop/[women|men|kids] routing and the unisex-pairing logic depend
-- on its exact values). This is a new, separate nullable column.
-- ============================================================================
alter table products add column if not exists product_category text;

-- ============================================================================
-- PRODUCT SYSTEM UPGRADE — PHASE 4 (variant-aware checkout + inventory)
-- `order_items` gains a nullable `variant_id` — historical rows stay
-- exactly as they are (their `size`/`color` text is still the record of
-- what was actually bought); only orders placed from now on populate it.
-- ============================================================================
alter table order_items add column if not exists variant_id uuid references product_variants(id) on delete set null;

-- One function does the whole checkout — generates a unique order number,
-- inserts the order, and for each item checks + decrements the purchased
-- variant's stock and inserts the order_item, all inside a single
-- transaction. If any item is out of stock, the function raises and
-- Postgres rolls back everything in this call (the order row, any stock
-- already decremented for earlier items in the same order) — so two
-- concurrent purchases of the last unit can't both succeed, and a
-- multi-item order can't half-complete.
create or replace function public.place_order(
  p_shipping_name text,
  p_shipping_email text,
  p_shipping_phone text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_governorate text,
  p_user_id uuid,
  p_items jsonb -- [{product_id, variant_id, name, brand, price, currency, size, color, quantity, image}]
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_subtotal_usd numeric(10, 2) := 0;
  v_subtotal_egp numeric(10, 2) := 0;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity int;
  v_price numeric(10, 2);
  v_currency text;
  v_line_total numeric(10, 2);
  v_track_inventory boolean;
  v_updated int;
  v_attempt int := 0;
begin
  loop
    v_order_number := 'LC-' || floor(100000 + random() * 900000)::text;
    begin
      insert into orders (
        order_number, user_id, shipping_name, shipping_email, shipping_phone,
        shipping_address, shipping_city, shipping_governorate, subtotal_usd, subtotal_egp
      ) values (
        v_order_number, p_user_id, p_shipping_name, p_shipping_email, p_shipping_phone,
        p_shipping_address, p_shipping_city, p_shipping_governorate, 0, 0
      )
      returning id into v_order_id;
      exit;
    exception when unique_violation then
      v_attempt := v_attempt + 1;
      if v_attempt >= 5 then
        raise exception 'Could not generate a unique order number';
      end if;
    end;
  end loop;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::int;
    v_price := (v_item ->> 'price')::numeric;
    v_currency := v_item ->> 'currency';
    v_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;

    if v_variant_id is not null then
      select track_inventory into v_track_inventory
      from products
      where id = v_item ->> 'product_id';

      if coalesce(v_track_inventory, true) then
        update product_variants
        set quantity = quantity - v_quantity, updated_at = now()
        where id = v_variant_id
          and quantity >= v_quantity
          and availability_status = 'available';

        get diagnostics v_updated = row_count;
        if v_updated = 0 then
          raise exception 'INSUFFICIENT_STOCK: %', v_item ->> 'name';
        end if;
      end if;
    end if;

    insert into order_items (
      order_id, product_id, variant_id, name, brand, price, currency, size, color, quantity, image
    ) values (
      v_order_id, v_item ->> 'product_id', v_variant_id, v_item ->> 'name', v_item ->> 'brand',
      v_price, v_currency, v_item ->> 'size', nullif(v_item ->> 'color', ''), v_quantity, v_item ->> 'image'
    );

    v_line_total := v_price * v_quantity;
    if v_currency = 'EGP' then
      v_subtotal_egp := v_subtotal_egp + v_line_total;
    else
      v_subtotal_usd := v_subtotal_usd + v_line_total;
    end if;
  end loop;

  update orders set subtotal_usd = v_subtotal_usd, subtotal_egp = v_subtotal_egp where id = v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number);
end;
$$;
