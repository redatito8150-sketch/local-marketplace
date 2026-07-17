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
    check (status in ('pending', 'paid', 'fulfilled', 'cancelled')),
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

-- NOTE: There are deliberately no public INSERT policies yet. Writes
-- (placing an order, creating a profile) will go through a server-side
-- API route using the service_role key once Phase 3 (checkout) is wired
-- up — never directly from the browser with the anon key.
