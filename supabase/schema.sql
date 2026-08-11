-- ============================================================================
-- LOCAL marketplace — Supabase schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
--
-- !!! KNOWN STALE — DO NOT PROVISION A NEW ENVIRONMENT FROM THIS FILE ALONE.
-- As of 2026-08-05, this file reflects roughly migrations #1-21 of the 65
-- files in supabase/migrations/ (through 20260727000001), plus one later
-- file applied out of order. Migrations #22-65 (product taxonomy/options/
-- variants rebuild, reviews system, inventory rebuild, multi-brand order
-- splitting, custom roles/permissions, brand_id-based ownership replacing
-- brand_slug, and more) are NOT reflected here at all — entire tables
-- (reviews, product_options, taxonomy_nodes, collections, user_notifications,
-- roles/permissions, and others), RLS policies, and RPC function bodies that
-- exist live do not appear in this file.
--
-- To provision a fresh environment that actually matches production,
-- replay every file in supabase/migrations/ in filename (chronological)
-- order instead of running this file. Regenerating this file itself needs
-- a live `supabase db dump`/`pg_dump` against the real project (not
-- available in this pass — no Supabase CLI/direct Postgres connection
-- string on hand) rather than a manual rewrite, to avoid shipping a
-- "corrected" file that's still subtly wrong. Tracked as MIG-001 in
-- docs/audits/2026-08-04-security-and-repository-organization/08-deferred-risks-and-recommendations.md.
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
  phone text,
  phone_verified_at timestamptz,
  onboarding_completed_at timestamptz,
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

-- Non-authoritative link from an order back to the saved address it came
-- from (admin traceability only — the shipping_* columns above stay the
-- authoritative, immutable snapshot; this FK may go null if the address is
-- later deleted, and that's fine).
alter table orders add column if not exists address_id uuid;

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
-- ADDRESSES
-- Saved delivery addresses (account/checkout). Shape matches what
-- lib/data/addresses.ts and app/api/account/addresses/* already read/write.
-- ============================================================================
create table if not exists addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Home' check (label in ('Home', 'Work', 'Other')),
  first_name text not null,
  last_name text not null,
  phone text not null,
  address_line text not null,
  city text not null,
  governorate text not null,
  building_number text,
  floor text,
  apartment text,
  landmark text,
  delivery_instructions text,
  postal_code text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists addresses_user_id_idx on addresses (user_id);

-- OTP tracking for phone verification (app/api/account/phone/*). Phone is a
-- secondary claim on profiles here, not a second auth.users identifier —
-- email stays the sole login identity.
create table if not exists phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists phone_verifications_user_id_idx on phone_verifications (user_id);

-- Self-reported device registry for the security page's "your devices"
-- list (app/api/account/sessions/*) — not a live session store, Supabase
-- Auth itself owns real session/token validity.
create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, device_id)
);

create index if not exists user_sessions_user_id_idx on user_sessions (user_id);

alter table orders drop constraint if exists orders_address_id_fkey;
alter table orders add constraint orders_address_id_fkey
  foreign key (address_id) references addresses (id) on delete set null;

-- Atomic default-address swap — clears is_default on the user's other
-- addresses and sets it on the target row in one statement, so there's
-- never a window with zero or two defaults. Ownership (p_user_id must
-- match the row) is checked inside the function itself, not just trusted
-- from the caller.
create or replace function public.set_default_address(p_user_id uuid, p_address_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update addresses
  set is_default = (id = p_address_id), updated_at = now()
  where user_id = p_user_id
    and (is_default = true or id = p_address_id);
end;
$$;

-- Checkout currently supports cash on delivery only. Store the real method
-- and state explicitly so orders never imply an unprocessed card payment.
alter table orders add column if not exists payment_method text not null default 'cash_on_delivery';
alter table orders drop constraint if exists orders_payment_method_check;
alter table orders add constraint orders_payment_method_check
  check (payment_method in ('cash_on_delivery'));
alter table orders add column if not exists payment_status text not null default 'unpaid';
alter table orders drop constraint if exists orders_payment_status_check;
alter table orders add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'refunded'));

-- ============================================================================
-- BRAND APPLICATIONS
-- Submissions from app/join-as-a-brand/apply. Reviewed from
-- app/admin/applications. Rebuilt 2026-07-25 (feature/brand-application-redesign)
-- into a full authenticated, multi-step, resumable workflow — see
-- supabase/migrations/20260725000001_brand_application_workflow.sql for the
-- full reasoning (kept here only as the "current state" reference; that
-- migration is the source of truth for how each column was added).
--
-- applicant_user_id is nullable: rows submitted before this rebuild have no
-- linked account and stay as read-only legacy records, never backfilled
-- with a guessed identity. Every new row always carries a real one, derived
-- server-side from the authenticated session — never trusted from a
-- request body.
--
-- sales_channels (free text) is kept for legacy rows; new submissions use
-- the structured sales_channels_list array instead — deliberately not
-- unified into one column, same "document divergence, don't silently
-- merge it" precedent used elsewhere in this schema (see the phone/password
-- min-length notes on other tables).
--
-- applicant_account_snapshot captures the applicant's account name/email/
-- phone/created_at once, at submission time — lets the admin see what the
-- account looked like when they applied without ever overwriting live
-- profile data with application-entered data, and without assuming the
-- application's own contact email identifies the authenticated account.
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
  sales_channels text,
  status text not null default 'draft'
    check (status in (
      'draft', 'submitted', 'under_review', 'changes_requested', 'resubmitted',
      'approved_pending_creation', 'approved', 'rejected', 'withdrawn', 'converted_to_brand'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applicant_user_id uuid references auth.users (id) on delete cascade,
  applicant_role text,
  brand_name_ar text,
  brand_name_en text,
  website_url text,
  other_social_urls text[] not null default '{}',
  additional_categories text[] not null default '{}',
  founding_year int,
  country text,
  city text,
  sales_channels_list text[] not null default '{}',
  approx_product_count int,
  approx_monthly_orders text,
  legal_status text
    check (legal_status is null or legal_status in (
      'both_docs', 'commercial_registration_only', 'tax_card_only',
      'documents_pending', 'unregistered_individual', 'other'
    )),
  commercial_registration_number text,
  tax_registration_number text,
  legal_business_name text,
  product_price_range text,
  products_manufactured_by_brand boolean,
  made_to_order boolean,
  avg_preparation_time text,
  shipping_coverage text,
  return_exchange_available boolean,
  inventory_status text,
  consent_accurate boolean not null default false,
  consent_terms boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id),
  rejection_reason text,
  admin_notes text,
  changes_requested_message text,
  approved_brand_id text references brands (slug),
  reapplication_allowed_at timestamptz,
  reapplication_override boolean not null default false,
  converted_at timestamptz,
  converted_by uuid references auth.users (id),
  applicant_account_snapshot jsonb
);

create index if not exists brand_applications_applicant_user_id_idx
  on brand_applications (applicant_user_id);
create index if not exists brand_applications_status_idx
  on brand_applications (status);

-- Race-condition-proof "one active application per user" limit — a unique
-- index ignores nulls, so legacy rows with no applicant_user_id are never
-- constrained by it.
create unique index if not exists brand_applications_one_active_per_user
  on brand_applications (applicant_user_id)
  where status in (
    'draft', 'submitted', 'under_review', 'changes_requested',
    'resubmitted', 'approved_pending_creation'
  );

create or replace function public.brand_applications_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brand_applications_updated_at on brand_applications;
create trigger brand_applications_updated_at
  before update on brand_applications
  for each row execute function public.brand_applications_set_updated_at();

-- One row per uploaded legal/supporting document. Stored in the private
-- brand-application-documents bucket (public = false) — never a public URL,
-- always a short-lived signed URL issued from an admin-gated route.
create table if not exists brand_application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references brand_applications (id) on delete cascade,
  uploaded_by uuid references auth.users (id),
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes int not null,
  created_at timestamptz not null default now()
);

create index if not exists brand_application_documents_application_id_idx
  on brand_application_documents (application_id);

-- Append-only timeline of every status transition, independent of the
-- single current `status` column on brand_applications.
create table if not exists brand_application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references brand_applications (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users (id),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists brand_application_status_history_application_id_idx
  on brand_application_status_history (application_id);

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
-- No public policies on any of these three, on purpose — same convention as
-- orders/addresses/profiles: every read/write goes through supabaseAdmin
-- from Next.js routes gated by requireUser()/requireAdminUser(). Per-column
-- write protection (an applicant can edit their own draft but never set
-- status/admin_notes/applicant_user_id themselves) isn't expressible in
-- row-level RLS alone, so it's enforced in the API routes instead.
alter table brand_application_documents enable row level security;
alter table brand_application_status_history enable row level security;
alter table addresses enable row level security;
alter table phone_verifications enable row level security;
-- Never read from the browser at all — send-otp/verify-otp both go through
-- service_role, no select policy for anon/authenticated, same as audit_logs.
alter table user_sessions enable row level security;

create policy "Users can read their own sessions"
  on user_sessions for select
  using (auth.uid() = user_id);

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

-- No public "list everyone" policy — only the owning user can read their
-- own addresses. All writes go through service_role in
-- app/api/account/addresses/*, same convention as orders/order_items below.
create policy "Users can read their own addresses"
  on addresses for select
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
-- avatar_url always starts null on a fresh signup — a manually uploaded
-- photo can only ever come later, through app/api/account/avatar (see the
-- PROFILE AVATAR PRIORITY section near the end of this file).
-- provider_avatar_url captures whatever the OAuth provider (if any) handed
-- over at signup as a same-tick fallback.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, avatar_url, provider_avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.raw_user_meta_data ->> 'phone',
    null,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
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

-- place_order() itself is defined once, further below (search "One function
-- does the whole checkout") — every phase that extended it (coupons, brand
-- attribution) edits that single definition in place via `create or replace`
-- rather than layering a second copy here, so there's exactly one source of
-- truth for its current signature and behavior.

-- ============================================================================
-- ADMIN DASHBOARD EXPANSION — Phase 1: Roles & Audit Log
-- ============================================================================

-- Granular permission tier on top of the existing is_admin boolean.
-- is_admin still gates "/admin at all" (unchanged, every existing check
-- keeps working); role adds section-level gating for staff/manager/admin,
-- and a separate brand_owner track for the future brand portal.
alter table profiles add column if not exists role text not null default 'customer'
  check (role in ('customer', 'staff', 'manager', 'admin', 'brand_owner'));

-- One-time backfill: every existing is_admin=true account becomes a full admin.
update profiles set role = 'admin' where is_admin = true and role = 'customer';

-- Full history of admin actions: who, what, when, and the before/after value.
-- entity_id is always text — uuid PKs (orders, profiles, product_variants)
-- cast to text, text PKs (products.id, brands.slug) used as-is. No real FK
-- is possible across five differently-typed parent tables, so entity_type
-- tells the app which table entity_id refers to.
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  actor_label text not null default '',
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_idx on audit_logs (actor_id);
create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);

alter table audit_logs enable row level security;
-- No public policy at all — admin-only, service-role reads/writes, same
-- convention as notifications.

-- ============================================================================
-- ADMIN DASHBOARD EXPANSION — Phase 3: Order Cancellation with Restock
-- ============================================================================

alter table orders add column if not exists internal_notes text;

-- Mirrors place_order's transactional safety in reverse: locks the order
-- row first (blocks a concurrent double-cancel), refuses to touch a
-- fulfilled order, then restocks every item's variant and flips the
-- status — all inside one transaction, so a failure partway through
-- rolls back the whole cancellation instead of leaving stock half-restored.
create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_item record;
  v_track_inventory boolean;
  v_restocked int := 0;
begin
  select status into v_status from orders where id = p_order_id for update;

  if v_status is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_status = 'cancelled' then
    raise exception 'ALREADY_CANCELLED';
  end if;
  if v_status = 'fulfilled' then
    raise exception 'CANNOT_CANCEL_FULFILLED';
  end if;

  for v_item in
    select oi.variant_id, oi.quantity, pv.product_id
    from order_items oi
    join product_variants pv on pv.id = oi.variant_id
    where oi.order_id = p_order_id
  loop
    select track_inventory into v_track_inventory from products where id = v_item.product_id;

    if coalesce(v_track_inventory, true) then
      update product_variants
      set quantity = quantity + v_item.quantity, updated_at = now()
      where id = v_item.variant_id;
      v_restocked := v_restocked + 1;
    end if;
  end loop;

  update orders set status = 'cancelled' where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'restocked_variants', v_restocked);
end;
$$;

-- ============================================================================
-- ADMIN DASHBOARD EXPANSION — Phase 9: Discount/Coupon Codes
-- ============================================================================

create table if not exists coupons (
  code text primary key,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10, 2) not null,
  max_uses int,
  used_count int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table coupons enable row level security;
-- No public policy — coupons are validated only through a server-side route
-- (never read directly by the browser's anon key), so every valid code
-- can't be scraped by listing the table.

alter table orders add column if not exists coupon_code text references coupons(code) on delete set null;
alter table orders add column if not exists discount_amount_egp numeric(10, 2) not null default 0;

-- One function does the whole checkout — generates a unique order number,
-- inserts the order, and for each item checks + decrements the purchased
-- variant's stock and inserts the order_item, all inside a single
-- transaction. If any item is out of stock, the function raises and
-- Postgres rolls back everything in this call (the order row, any stock
-- already decremented for earlier items in the same order) — so two
-- concurrent purchases of the last unit can't both succeed, and a
-- multi-item order can't half-complete.
--
-- Additive since: existing callers that don't pass p_coupon_code keep
-- working unchanged (defaults to null, meaning "no coupon"). The coupon
-- row is locked with `for update` in the same transaction as the stock
-- decrement, so two concurrent checkouts racing a max_uses=1 coupon
-- serialize on that row — the second sees the incremented used_count and
-- is rejected, the same race-safety principle already governing per-variant
-- stock.
create or replace function public.place_order(
  p_shipping_name text,
  p_shipping_email text,
  p_shipping_phone text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_governorate text,
  p_user_id uuid,
  p_items jsonb,
  p_coupon_code text default null,
  p_address_id uuid default null
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
  v_coupon coupons%rowtype;
  v_discount_egp numeric(10, 2) := 0;
  v_coupon_code text;
begin
  loop
    v_order_number := 'LC-' || floor(100000 + random() * 900000)::text;
    begin
      insert into orders (
        order_number, user_id, shipping_name, shipping_email, shipping_phone,
        shipping_address, shipping_city, shipping_governorate, subtotal_usd, subtotal_egp,
        address_id
      ) values (
        v_order_number, p_user_id, p_shipping_name, p_shipping_email, p_shipping_phone,
        p_shipping_address, p_shipping_city, p_shipping_governorate, 0, 0,
        p_address_id
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
      order_id, product_id, variant_id, name, brand, brand_slug, price, currency, size, color, quantity, image
    ) values (
      v_order_id, v_item ->> 'product_id', v_variant_id, v_item ->> 'name', v_item ->> 'brand',
      nullif(v_item ->> 'brand_slug', ''), v_price, v_currency, v_item ->> 'size',
      nullif(v_item ->> 'color', ''), v_quantity, v_item ->> 'image'
    );

    v_line_total := v_price * v_quantity;
    if v_currency = 'EGP' then
      v_subtotal_egp := v_subtotal_egp + v_line_total;
    else
      v_subtotal_usd := v_subtotal_usd + v_line_total;
    end if;
  end loop;

  if p_coupon_code is not null and p_coupon_code <> '' then
    v_coupon_code := upper(p_coupon_code);
    select * into v_coupon from coupons where code = v_coupon_code for update;

    if not found then
      raise exception 'COUPON_INVALID: code not found';
    end if;
    if not v_coupon.active then
      raise exception 'COUPON_INVALID: this code is no longer active';
    end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
      raise exception 'COUPON_INVALID: this code has expired';
    end if;
    if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then
      raise exception 'COUPON_INVALID: this code has reached its usage limit';
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_discount_egp := round(v_subtotal_egp * v_coupon.discount_value / 100, 2);
    else
      v_discount_egp := least(v_coupon.discount_value, v_subtotal_egp);
    end if;

    update coupons set used_count = used_count + 1 where code = v_coupon_code;
  end if;

  update orders
  set subtotal_usd = v_subtotal_usd,
      subtotal_egp = v_subtotal_egp,
      coupon_code = v_coupon_code,
      discount_amount_egp = v_discount_egp
  where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'discount_amount_egp', v_discount_egp
  );
end;
$$;

-- ============================================================================
-- ADMIN DASHBOARD EXPANSION — Phase 10: Brand-Owner Portal
-- ============================================================================

-- One brand per owner for v1 — the partial unique index enforces this at
-- the DB level while leaving owner_user_id nullable (most brands stay
-- admin-only-managed, never linked to a login).
alter table brands add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists brands_owner_user_id_key on brands (owner_user_id) where owner_user_id is not null;

-- Populated only for orders placed after this migration ships — historical
-- rows keep it null forever, same "never rewrite order history" principle
-- already governing USD-vs-EGP history. product_variants already has a
-- public-read policy, so no new policy is needed there for the portal's
-- stock view; order_items/orders do need new policies since their existing
-- ones only cover "the customer who placed it," not a brand owner.
alter table order_items add column if not exists brand_slug text references brands(slug) on delete set null;

create policy "Brand owners can read their own order items"
  on order_items for select using (
    brand_slug in (select slug from brands where owner_user_id = auth.uid())
  );

-- A plain inline EXISTS subquery here (checking order_items from an orders
-- policy) creates infinite recursion: evaluating order_items' own policies
-- (the existing "Users can read their own order items" checks orders,
-- which would re-check this orders policy, which re-checks order_items,
-- forever). Wrapping the check in a `security definer` function breaks the
-- cycle — the function runs as its owner (bypassing RLS internally on the
-- table it queries), so evaluating this orders policy no longer re-triggers
-- order_items' RLS.
create or replace function public.brand_owns_order_item(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from order_items oi
    join brands b on b.slug = oi.brand_slug
    where oi.order_id = p_order_id
      and b.owner_user_id = auth.uid()
  );
$$;

create policy "Brand owners can read orders containing their items"
  on orders for select using (
    public.brand_owns_order_item(orders.id)
  );

-- ============================================================================
-- ADMIN DASHBOARD EXPANSION — Phase 11: Homepage/Marketing Content Management
-- ============================================================================

-- One generic key/value table for every admin-editable marketing copy block
-- (home hero, category heroes, journal articles, join-page hero) instead of
-- a bespoke schema per content type. Every public read path falls back to
-- the current static content/*.ts export when a row is missing, so this
-- ships with zero required data-entry and zero downtime risk — deleting a
-- row (or never populating it) just means the page shows its original
-- static copy instead of erroring.
create table if not exists site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table site_content enable row level security;

-- Public read (every storefront page needs this); no insert/update/delete
-- policy — writes go through supabaseAdmin (service_role) only, from admin
-- API routes, same convention as products/brands.
create policy "Anyone can read site content"
  on site_content for select using (true);

-- ============================================================================
-- ADMIN DASHBOARD ROUND 3 — Phase 1: Schema & Role Foundation
-- Brand-owner self-service product submission/editing with an admin review
-- gate, plus a new brand_assistant rank. See the session's approved plan
-- for the full design; summary of what these columns are for:
--   - pending_changes: a full staged-edit snapshot (same shape ProductForm
--     already submits) used only when editing an ALREADY-PUBLISHED product
--     — the live columns stay untouched until an admin approves, so the
--     live site never shows a half-reviewed edit.
--   - review_notes / submitted_by / reviewed_by / reviewed_at: the
--     approve/request-changes trail for both new submissions and staged edits.
--   - deletion_requested_at: a brand owner/assistant can request deletion,
--     but the row is never removed until an admin approves it here.
--   - paused_by_brand: an instant, no-approval on/off switch (the "stop
--     this product right now" capability) — independent of the review
--     flow above; a published product with this true is hidden from the
--     storefront exactly like a non-published one.
-- ============================================================================

alter table products drop constraint if exists products_status_check;
alter table products add constraint products_status_check
  check (status in ('draft', 'pending_review', 'changes_requested', 'published', 'archived'));

alter table products add column if not exists pending_changes jsonb;
alter table products add column if not exists review_notes text;
alter table products add column if not exists submitted_by uuid references auth.users(id) on delete set null;
alter table products add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table products add column if not exists reviewed_at timestamptz;
alter table products add column if not exists deletion_requested_at timestamptz;
alter table products add column if not exists paused_by_brand boolean not null default false;

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('customer', 'staff', 'manager', 'admin', 'brand_owner', 'brand_assistant'));

-- A brand can have at most one true owner (brands.owner_user_id, enforced
-- by its own partial unique index) but any number of assistants — a
-- separate junction table, not a second single-owner column.
create table if not exists brand_staff (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null references brands(slug) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (brand_slug, user_id)
);

alter table brand_staff enable row level security;

create policy "Users can read their own brand_staff rows"
  on brand_staff for select using (user_id = auth.uid());

-- Denormalized at write time by every product/brand write path that knows
-- which brand it's touching — never backfilled onto history, same
-- "tag going forward only" principle already governing
-- order_items.brand_slug.
alter table audit_logs add column if not exists brand_slug text;

-- ============================================================================
-- INSTANT-PUBLISH — brand-initiated product changes apply live; a
-- resolvable notification lets the admin Approve (leave it) or Revert
-- (undo via the linked audit_logs before/after snapshot) right from the
-- notification itself, without navigating elsewhere.
-- ============================================================================
alter table notifications add column if not exists related_entity_type text;
alter table notifications add column if not exists related_entity_id text;
alter table notifications add column if not exists audit_log_id uuid references audit_logs(id) on delete set null;
alter table notifications add column if not exists resolution text not null default 'n/a'
  check (resolution in ('pending', 'approved', 'reverted', 'n/a'));
create index if not exists notifications_resolution_idx on notifications (resolution);

-- ============================================================================
-- DISCORD LOG MIRRORING — every notify()/logAudit() call and every existing
-- "log, don't throw" error site also posts to a Discord webhook (see
-- lib/discord.ts), so nothing is lost even though this table stays bounded.
-- audit_logs is deliberately left unbounded (used by the admin Audit Log
-- page's filters/search and the brand-portal's own /brand-portal/logs).
-- Cap is 50, not 30 — raised once already per the site owner's own call.
-- ============================================================================
create or replace function public.prune_old_notifications()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  delete from notifications
  where id in (
    select id from notifications
    order by created_at desc
    offset 50
  );
  return new;
end;
$$;

drop trigger if exists trigger_prune_notifications on notifications;
create trigger trigger_prune_notifications
  after insert on notifications
  for each row
  execute function public.prune_old_notifications();

-- ============================================================================
-- BUG FIX — cancel_order() never gave back a coupon's used_count.
-- A cancelled order that had a limited-use coupon applied was permanently
-- burning one use of that code, even though the order itself never
-- completed. Re-created (not altered in place) to keep every previous
-- migration in this file untouched, same convention as every other
-- additive fix here.
-- ============================================================================
create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_coupon_code text;
  v_item record;
  v_track_inventory boolean;
  v_restocked int := 0;
begin
  select status, coupon_code into v_status, v_coupon_code from orders where id = p_order_id for update;

  if v_status is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_status = 'cancelled' then
    raise exception 'ALREADY_CANCELLED';
  end if;
  if v_status = 'fulfilled' then
    raise exception 'CANNOT_CANCEL_FULFILLED';
  end if;

  for v_item in
    select oi.variant_id, oi.quantity, pv.product_id
    from order_items oi
    join product_variants pv on pv.id = oi.variant_id
    where oi.order_id = p_order_id
  loop
    select track_inventory into v_track_inventory from products where id = v_item.product_id;

    if coalesce(v_track_inventory, true) then
      update product_variants
      set quantity = quantity + v_item.quantity, updated_at = now()
      where id = v_item.variant_id;
      v_restocked := v_restocked + 1;
    end if;
  end loop;

  if v_coupon_code is not null then
    update coupons set used_count = greatest(used_count - 1, 0) where code = v_coupon_code;
  end if;

  update orders set status = 'cancelled' where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'restocked_variants', v_restocked);
end;
$$;
-- ============================================================================
-- PLATFORM SECURITY AUDIT — public RPC and storefront visibility boundaries
-- ============================================================================
-- Security boundary hardening for public PostgREST access.
-- Additive and idempotent: it does not delete business data.

-- Trigger-only and privileged mutation functions must not be callable through
-- the public API roles. Server routes use the service-role client explicitly.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

revoke all on function public.prune_old_notifications() from public;
revoke all on function public.prune_old_notifications() from anon, authenticated;

revoke all on function public.cancel_order(uuid) from public;
revoke all on function public.cancel_order(uuid) from anon, authenticated;
grant execute on function public.cancel_order(uuid) to service_role;

revoke all on function public.set_default_address(uuid, uuid) from public;
revoke all on function public.set_default_address(uuid, uuid) from anon, authenticated;
grant execute on function public.set_default_address(uuid, uuid) to service_role;

-- place_order gained p_address_id (a new trailing parameter) — that's a
-- different signature to Postgres, so the old 9-arg overload is dropped
-- explicitly rather than left behind alongside this one.
drop function if exists public.place_order(text, text, text, text, text, text, uuid, jsonb, text);

revoke all on function public.place_order(text, text, text, text, text, text, uuid, jsonb, text, uuid)
  from public;
revoke all on function public.place_order(text, text, text, text, text, text, uuid, jsonb, text, uuid)
  from anon, authenticated;
grant execute on function public.place_order(text, text, text, text, text, text, uuid, jsonb, text, uuid)
  to service_role;

-- ============================================================================
-- BRAND APPLICATION DOCUMENTS — private storage bucket
-- This repo's one other bucket (product-images) was created by hand in the
-- Supabase dashboard; there's no precedent here for bucket-creation SQL
-- reliably taking effect. This insert is included for convenience but MUST
-- BE VERIFIED in Storage → Buckets (confirm brand-application-documents
-- exists with Public OFF), and created by hand there if this insert didn't
-- take effect.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('brand-application-documents', 'brand-application-documents', false)
on conflict (id) do nothing;

create policy "Applicants can upload their own application documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'brand-application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Applicants can read their own application documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'brand-application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Admins can read all application documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'brand-application-documents'
    and exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin
    )
  );

-- Atomic approve-to-brand conversion — mirrors place_order()'s pattern
-- (security definer, pinned search_path, service_role-only). Idempotent:
-- calling it again on an already-converted application raises instead of
-- creating a second brand.
create or replace function public.convert_application_to_brand(
  p_application_id uuid,
  p_admin_user_id uuid,
  p_brand jsonb
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_approved_brand_id text;
  v_slug text;
begin
  select status, approved_brand_id into v_status, v_approved_brand_id
  from brand_applications
  where id = p_application_id
  for update;

  if v_status is null then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;
  if v_approved_brand_id is not null or v_status = 'converted_to_brand' then
    raise exception 'ALREADY_CONVERTED';
  end if;
  if v_status not in ('approved', 'approved_pending_creation') then
    raise exception 'NOT_APPROVED';
  end if;

  v_slug := p_brand->>'slug';
  if v_slug is null or length(trim(v_slug)) = 0 then
    raise exception 'MISSING_SLUG';
  end if;

  -- Column set mirrors POST /api/admin/brands' plain insert exactly (see
  -- 20260721_collection_brand_content.sql for logo_image/website_url/
  -- story_image_2/shop_the_look) so a converted brand never lacks a field
  -- the normal create form would have set.
  insert into brands (
    slug, name, tagline, category, founded_year, city, hero_image,
    logo_image, website_url, about_description, about_image,
    story_image, story_image_2, story_body,
    info_badges, category_tabs, active_tab, values, similar_brand_slugs,
    shop_the_look
  )
  values (
    v_slug,
    p_brand->>'name',
    coalesce(p_brand->>'tagline', ''),
    coalesce(p_brand->>'category', ''),
    nullif(p_brand->>'foundedYear', '')::int,
    coalesce(p_brand->>'city', 'Cairo'),
    coalesce(p_brand->>'heroImage', ''),
    nullif(p_brand->>'logoImage', ''),
    nullif(p_brand->>'websiteUrl', ''),
    coalesce(p_brand->>'aboutDescription', ''),
    coalesce(p_brand->>'aboutImage', ''),
    coalesce(p_brand->>'storyImage', ''),
    nullif(p_brand->>'storyImage2', ''),
    coalesce(p_brand->>'storyBody', ''),
    coalesce(p_brand->'infoBadges', '[]'::jsonb),
    coalesce(p_brand->'categoryTabs', '[]'::jsonb),
    coalesce(p_brand->>'activeTab', 'shop-all'),
    coalesce(p_brand->'values', '[]'::jsonb),
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_brand->'similarBrandSlugs', '[]'::jsonb))),
      '{}'
    ),
    coalesce(p_brand->'shopTheLook', '[]'::jsonb)
  );

  update brand_applications
  set
    status = 'converted_to_brand',
    approved_brand_id = v_slug,
    converted_at = now(),
    converted_by = p_admin_user_id
  where id = p_application_id;

  insert into brand_application_status_history (application_id, from_status, to_status, changed_by, reason)
  values (p_application_id, v_status, 'converted_to_brand', p_admin_user_id, 'Brand created from application');

  return v_slug;
end;
$$;

revoke all on function public.convert_application_to_brand(uuid, uuid, jsonb) from public;
revoke all on function public.convert_application_to_brand(uuid, uuid, jsonb) from anon, authenticated;
grant execute on function public.convert_application_to_brand(uuid, uuid, jsonb) to service_role;

-- Atomic product + variant replacement. Route handlers perform authorization
-- and validation; this service-role-only function guarantees all-or-nothing
-- persistence when an admin or brand owner saves a full product form.
create or replace function public.replace_product_with_variants(
  p_product_id text,
  p_product jsonb,
  p_variants jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_product) <> 'object'
     or jsonb_typeof(p_variants) <> 'array' then
    raise exception 'Invalid product payload';
  end if;

  update public.products
  set
    name = p_product->>'name',
    brand_name = p_product->>'brand_name',
    brand_slug = nullif(p_product->>'brand_slug', ''),
    category = nullif(p_product->>'category', ''),
    product_category = nullif(p_product->>'product_category', ''),
    product_type = nullif(p_product->>'product_type', ''),
    collection = nullif(p_product->>'collection', ''),
    material = nullif(p_product->>'material', ''),
    fit = nullif(p_product->>'fit', ''),
    price = (p_product->>'price')::numeric,
    compare_at_price = nullif(p_product->>'compare_at_price', '')::numeric,
    currency = p_product->>'currency',
    image = p_product->>'image',
    images = array(select jsonb_array_elements_text(p_product->'images')),
    colors = p_product->'colors',
    sizes = array(select jsonb_array_elements_text(p_product->'sizes')),
    description = p_product->>'description',
    details = array(select jsonb_array_elements_text(p_product->'details')),
    care_instructions = array(select jsonb_array_elements_text(p_product->'care_instructions')),
    shipping_returns = p_product->>'shipping_returns',
    model_height = nullif(p_product->>'model_height', ''),
    model_wearing = nullif(p_product->>'model_wearing', ''),
    sku = p_product->>'sku',
    in_stock = (p_product->>'in_stock')::boolean,
    is_new = (p_product->>'is_new')::boolean,
    is_unisex = (p_product->>'is_unisex')::boolean,
    unavailable_sizes = array(select jsonb_array_elements_text(p_product->'unavailable_sizes')),
    track_inventory = (p_product->>'track_inventory')::boolean,
    featured = case when p_product ? 'featured' then (p_product->>'featured')::boolean else featured end,
    status = p_product->>'status',
    publish_date = nullif(p_product->>'publish_date', '')::timestamptz,
    submitted_by = case when p_product ? 'submitted_by' then nullif(p_product->>'submitted_by', '')::uuid else submitted_by end,
    pending_changes = case
      when p_product ? 'pending_changes' and p_product->'pending_changes' = 'null'::jsonb then null
      when p_product ? 'pending_changes' then p_product->'pending_changes'
      else pending_changes
    end,
    review_notes = case when p_product ? 'review_notes' then p_product->>'review_notes' else review_notes end
  where id = p_product_id;

  if not found then raise exception 'Product not found'; end if;

  delete from public.product_variants where product_id = p_product_id;
  insert into public.product_variants (
    product_id, color, size, sku, quantity, low_stock_threshold,
    price_override, availability_status
  )
  select p_product_id, nullif(v.color, ''), nullif(v.size, ''), nullif(v.sku, ''),
    v.quantity, v.low_stock_threshold, v.price_override, v.availability_status
  from jsonb_to_recordset(p_variants) as v(
    color text, size text, sku text, quantity int, low_stock_threshold int,
    price_override numeric, availability_status text
  );
end;
$$;

revoke all on function public.replace_product_with_variants(text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_product_with_variants(text, jsonb, jsonb)
  to service_role;

-- Atomic profile role + brand membership transition.
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
begin
  if p_access not in ('customer', 'brand_owner', 'brand_assistant', 'staff', 'manager', 'admin') then
    raise exception 'Invalid access level';
  end if;
  if p_access in ('brand_owner', 'brand_assistant') and nullif(p_brand_slug, '') is null then
    raise exception 'A brand is required for this access level';
  end if;
  if p_access in ('brand_owner', 'brand_assistant')
     and not exists (select 1 from public.brands where slug = p_brand_slug) then
    raise exception 'Brand not found';
  end if;

  update public.brands set owner_user_id = null
  where owner_user_id = p_user_id
    and (p_access <> 'brand_owner' or slug <> p_brand_slug);
  if p_access = 'brand_owner' then
    update public.brands set owner_user_id = p_user_id where slug = p_brand_slug;
  end if;

  delete from public.brand_staff where user_id = p_user_id;
  if p_access = 'brand_assistant' then
    insert into public.brand_staff (brand_slug, user_id)
    values (p_brand_slug, p_user_id)
    on conflict (brand_slug, user_id) do nothing;
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

-- This helper participates in an authenticated order policy. Keep it
-- unavailable to anonymous callers while retaining the minimum policy role.
revoke all on function public.brand_owns_order_item(uuid) from public;
revoke all on function public.brand_owns_order_item(uuid) from anon;
grant execute on function public.brand_owns_order_item(uuid) to authenticated, service_role;

drop policy if exists "Brand owners can read orders containing their items" on public.orders;
create policy "Brand owners can read orders containing their items"
  on public.orders for select
  to authenticated
  using (public.brand_owns_order_item(orders.id));

-- Public storefront reads see only live products. Authenticated brand members
-- receive a separate owner-scoped policy for their workflow states.
drop policy if exists "Public can read products" on public.products;
drop policy if exists "Public can read published products" on public.products;
create policy "Public can read published products"
  on public.products for select
  to anon, authenticated
  using (status = 'published' and coalesce(paused_by_brand, false) = false);

drop policy if exists "Brand members can read their products" on public.products;
create policy "Brand members can read their products"
  on public.products for select
  to authenticated
  using (
    brand_slug in (
      select b.slug from public.brands b where b.owner_user_id = auth.uid()
    )
    or brand_slug in (
      select bs.brand_slug from public.brand_staff bs where bs.user_id = auth.uid()
    )
  );

-- Variant visibility follows the parent product. This prevents anonymous
-- inventory reads for draft/archived products while preserving storefront
-- variant selection and brand-portal inventory access.
drop policy if exists "Public can read product variants" on public.product_variants;
drop policy if exists "Public can read published product variants" on public.product_variants;
create policy "Public can read published product variants"
  on public.product_variants for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.products p
      where p.id = product_variants.product_id
        and p.status = 'published'
        and coalesce(p.paused_by_brand, false) = false
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
          p.brand_slug in (
            select b.slug from public.brands b where b.owner_user_id = auth.uid()
          )
          or p.brand_slug in (
            select bs.brand_slug from public.brand_staff bs where bs.user_id = auth.uid()
          )
        )
    )
  );

-- ============================================================================
-- PAGE STUDIO — typed drafts, explicit publishing, and version history
-- ============================================================================
-- Page Studio foundation: drafts are private, publishing is explicit, and
-- every release is restorable. No arbitrary code or component names are stored.
create table if not exists public.page_sections (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  section_key text not null,
  section_type text not null check (section_type in (
    'hero', 'category_cards', 'benefits_strip', 'product_carousel',
    'product_grid', 'mood_tiles', 'featured_brand', 'brand_carousel',
    'promotional_banner', 'editorial_image', 'text_block', 'newsletter',
    'sponsored_brands', 'custom_product_collection', 'all_products_preview'
  )),
  draft_position integer not null check (draft_position >= 0),
  published_position integer not null check (published_position >= 0),
  is_required boolean not null default false,
  draft_config jsonb not null default '{}'::jsonb,
  published_config jsonb not null default '{}'::jsonb,
  draft_visible boolean not null default true,
  published_visible boolean not null default true,
  draft_deleted boolean not null default false,
  published_deleted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_key, section_key),
  unique (page_key, draft_position) deferrable initially deferred,
  unique (page_key, published_position) deferrable initially deferred
);

create index if not exists page_sections_page_draft_position_idx
  on public.page_sections (page_key, draft_position);
create index if not exists page_sections_page_published_position_idx
  on public.page_sections (page_key, published_position);

create table if not exists public.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_key, version)
);

create index if not exists page_versions_page_created_idx
  on public.page_versions (page_key, created_at desc);

alter table public.page_sections enable row level security;
alter table public.page_versions enable row level security;
-- Deliberately no browser policies. Storefront reads use the server-only
-- data layer so draft_config and version history can never leak to anon.

-- Existing installations may already have the first Page Studio prototype.
-- Move its homepage positions out of the target range before the idempotent
-- seed so the new All Products section cannot collide with an old slot.
update public.page_sections
set draft_position = draft_position + 100000,
    published_position = published_position + 100000
where page_key = 'home';

insert into public.page_sections (
  page_key, section_key, section_type, draft_position, published_position, is_required,
  draft_config, published_config, draft_visible, published_visible
)
values
  ('home', 'home_hero', 'hero', 10, 10, true,
    coalesce((select value from public.site_content where key = 'home_hero'), '{"headingLines":["Local brands.","Real stories.","All in one place."],"subheading":"Discover and shop from the best local brands. Support creators. Wear what matters.","ctaLabel":"Join As Brand","ctaHref":"/join-as-a-brand"}'::jsonb),
    coalesce((select value from public.site_content where key = 'home_hero'), '{"headingLines":["Local brands.","Real stories.","All in one place."],"subheading":"Discover and shop from the best local brands. Support creators. Wear what matters.","ctaLabel":"Join As Brand","ctaHref":"/join-as-a-brand"}'::jsonb), true, true),
  ('home', 'home_hero_tiles', 'category_cards', 20, 20, true,
    coalesce((select value from public.site_content where key = 'home_hero_tiles'), '{"women":{"label":"Women","href":"/shop/women","image":"/images/home/women-category-v2.png"},"men":{"label":"Men","href":"/shop/men","image":"/images/home/men-category-v2.png"},"kids":{"label":"Kids","href":"/shop/kids","image":"/images/home/kids-category-v2.png"},"home":{"label":"Home","href":"/shop/home","image":"https://images.unsplash.com/photo-1618220179428-22790b461013?w=800&q=80"}}'::jsonb),
    coalesce((select value from public.site_content where key = 'home_hero_tiles'), '{"women":{"label":"Women","href":"/shop/women","image":"/images/home/women-category-v2.png"},"men":{"label":"Men","href":"/shop/men","image":"/images/home/men-category-v2.png"},"kids":{"label":"Kids","href":"/shop/kids","image":"/images/home/kids-category-v2.png"},"home":{"label":"Home","href":"/shop/home","image":"https://images.unsplash.com/photo-1618220179428-22790b461013?w=800&q=80"}}'::jsonb), true, true),
  ('home', 'home_benefits', 'benefits_strip', 30, 30, true,
    '{"items":[{"title":"Curated with purpose","detail":"Handpicked local brands"},{"title":"Secure payments","detail":"Safe & trusted checkout"},{"title":"Fast delivery","detail":"Across Egypt"},{"title":"Easy returns","detail":"14 days to return"},{"title":"Support local","detail":"Empowering creators"}]}'::jsonb,
    '{"items":[{"title":"Curated with purpose","detail":"Handpicked local brands"},{"title":"Secure payments","detail":"Safe & trusted checkout"},{"title":"Fast delivery","detail":"Across Egypt"},{"title":"Easy returns","detail":"14 days to return"},{"title":"Support local","detail":"Empowering creators"}]}'::jsonb, true, true),
  ('home', 'home_new_arrivals', 'product_carousel', 40, 40, false,
    coalesce((select value from public.site_content where key = 'home_new_arrivals'), '{"title":"New Arrivals","source":"new","limit":12,"displayStyle":"carousel"}'::jsonb),
    coalesce((select value from public.site_content where key = 'home_new_arrivals'), '{"title":"New Arrivals","source":"new","limit":12,"displayStyle":"carousel"}'::jsonb), true, true),
  ('home', 'home_all_products', 'all_products_preview', 50, 50, false,
    '{"title":"Explore All Products","itemCount":10,"sorting":"newest","featuredOnly":false,"displayStyle":"carousel"}'::jsonb,
    '{"title":"Explore All Products","itemCount":10,"sorting":"newest","featuredOnly":false,"displayStyle":"carousel"}'::jsonb, true, true),
  ('home', 'shop_by_mood', 'mood_tiles', 60, 60, false,
    coalesce((select value from public.site_content where key = 'shop_by_mood'), '[{"id":"cairo-summer","label":"Cairo Summer","image":"https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&q=80","href":"/shop/women"},{"id":"weekend-escape","label":"Weekend Escape","image":"https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=600&q=80","href":"/shop/women"},{"id":"everyday-linen","label":"Everyday Linen","image":"https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=600&q=80","href":"/shop/women"},{"id":"after-dark","label":"After Dark","image":"https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&q=80","href":"/shop/women"},{"id":"made-for-movement","label":"Made for Movement","image":"https://images.unsplash.com/photo-1483721310020-03333e577078?w=600&q=80","href":"/shop/men"}]'::jsonb),
    coalesce((select value from public.site_content where key = 'shop_by_mood'), '[{"id":"cairo-summer","label":"Cairo Summer","image":"https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&q=80","href":"/shop/women"},{"id":"weekend-escape","label":"Weekend Escape","image":"https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=600&q=80","href":"/shop/women"},{"id":"everyday-linen","label":"Everyday Linen","image":"https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=600&q=80","href":"/shop/women"},{"id":"after-dark","label":"After Dark","image":"https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&q=80","href":"/shop/women"},{"id":"made-for-movement","label":"Made for Movement","image":"https://images.unsplash.com/photo-1483721310020-03333e577078?w=600&q=80","href":"/shop/men"}]'::jsonb), true, true),
  ('home', 'featured_brand_and_sponsored', 'featured_brand', 70, 70, false,
    coalesce((select value from public.site_content where key = 'featured_brand_and_sponsored'), '{"featuredBrandSlug":"studio-nile","sponsoredBrandSlugs":["nola","kai","sahara-form","remady-star"]}'::jsonb),
    coalesce((select value from public.site_content where key = 'featured_brand_and_sponsored'), '{"featuredBrandSlug":"studio-nile","sponsoredBrandSlugs":["nola","kai","sahara-form","remady-star"]}'::jsonb), true, true)
on conflict (page_key, section_key) do nothing;

update public.page_sections
set draft_position = case section_key
      when 'home_hero' then 10 when 'home_hero_tiles' then 20
      when 'home_benefits' then 30 when 'home_new_arrivals' then 40
      when 'home_all_products' then 50 when 'shop_by_mood' then 60
      when 'featured_brand_and_sponsored' then 70 else draft_position end,
    published_position = case section_key
      when 'home_hero' then 10 when 'home_hero_tiles' then 20
      when 'home_benefits' then 30 when 'home_new_arrivals' then 40
      when 'home_all_products' then 50 when 'shop_by_mood' then 60
      when 'featured_brand_and_sponsored' then 70 else published_position end
where page_key = 'home'
  and section_key in (
    'home_hero', 'home_hero_tiles', 'home_benefits', 'home_new_arrivals',
    'home_all_products', 'shop_by_mood', 'featured_brand_and_sponsored'
  );

update public.page_sections
set draft_config = case
      when jsonb_typeof(draft_config->'items') = 'array'
        and jsonb_array_length(draft_config->'items') > 0 then draft_config
      else '{"items":[{"title":"Curated with purpose","detail":"Handpicked local brands"},{"title":"Secure payments","detail":"Safe & trusted checkout"},{"title":"Fast delivery","detail":"Across Egypt"},{"title":"Easy returns","detail":"14 days to return"},{"title":"Support local","detail":"Empowering creators"}]}'::jsonb end,
    published_config = case
      when jsonb_typeof(published_config->'items') = 'array'
        and jsonb_array_length(published_config->'items') > 0 then published_config
      else '{"items":[{"title":"Curated with purpose","detail":"Handpicked local brands"},{"title":"Secure payments","detail":"Safe & trusted checkout"},{"title":"Fast delivery","detail":"Across Egypt"},{"title":"Easy returns","detail":"14 days to return"},{"title":"Support local","detail":"Empowering creators"}]}'::jsonb end
where page_key = 'home' and section_key = 'home_benefits';

create or replace function public.publish_page_draft(
  p_page_key text,
  p_actor_id uuid,
  p_actor_label text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version integer;
  v_before jsonb;
  v_after jsonb;
begin
  -- Serialize releases for the same page so max(version) + 1 remains unique.
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));

  if not exists (select 1 from public.page_sections where page_key = p_page_key) then
    raise exception 'Page not found';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.page_versions where page_key = p_page_key;

  select jsonb_agg(jsonb_build_object(
    'sectionKey', section_key, 'sectionType', section_type, 'position', published_position,
    'visible', published_visible, 'deleted', published_deleted, 'config', published_config
  ) order by published_position) into v_before
  from public.page_sections where page_key = p_page_key;

  update public.page_sections
  set published_config = draft_config,
      published_visible = draft_visible,
      published_position = draft_position,
      published_deleted = draft_deleted,
      published_by = p_actor_id,
      published_at = now(),
      updated_at = now()
  where page_key = p_page_key;

  select jsonb_agg(jsonb_build_object(
    'sectionKey', section_key, 'sectionType', section_type, 'position', published_position,
    'visible', published_visible, 'deleted', published_deleted, 'config', published_config
  ) order by published_position) into v_after
  from public.page_sections where page_key = p_page_key;

  insert into public.page_versions (page_key, version, snapshot, created_by)
  values (p_page_key, v_version, v_after, p_actor_id);

  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_id, p_actor_label, 'page', p_page_key, 'publish', v_before,
    jsonb_build_object('version', v_version, 'sections', v_after)
  );

  return v_version;
end;
$$;

create or replace function public.restore_page_version_to_draft(
  p_page_key text,
  p_version integer,
  p_actor_id uuid,
  p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_before jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));

  select snapshot into v_snapshot from public.page_versions
  where page_key = p_page_key and version = p_version;
  if v_snapshot is null then raise exception 'Page version not found'; end if;

  select jsonb_agg(jsonb_build_object(
    'sectionKey', section_key, 'position', draft_position,
    'visible', draft_visible, 'deleted', draft_deleted, 'config', draft_config
  ) order by draft_position) into v_before
  from public.page_sections where page_key = p_page_key;

  -- Move every draft position out of the published range first. This keeps
  -- restoring an older order safe even when newer sections occupy an old slot.
  update public.page_sections
  set draft_position = draft_position + 1000000
  where page_key = p_page_key;

  update public.page_sections section
  set draft_config = item.config,
      draft_visible = item.visible,
      draft_deleted = coalesce(item.deleted, false),
      draft_position = item.position,
      updated_by = p_actor_id,
      updated_at = now()
  from jsonb_to_recordset(v_snapshot) as item(
    "sectionKey" text, "sectionType" text, position integer,
    visible boolean, deleted boolean, config jsonb
  )
  where section.page_key = p_page_key and section.section_key = item."sectionKey";

  with snapshot_max as (
    select coalesce(max(item.position), 0) as max_position
    from jsonb_to_recordset(v_snapshot) as item(position integer)
  ), absent as (
    select section.id,
      row_number() over (order by section.created_at, section.id) as row_number
    from public.page_sections section
    where section.page_key = p_page_key
      and not exists (
        select 1 from jsonb_to_recordset(v_snapshot) as item("sectionKey" text)
        where item."sectionKey" = section.section_key
      )
  )
  update public.page_sections section
  set draft_visible = section.is_required,
      draft_deleted = not section.is_required,
      draft_position = snapshot_max.max_position + (absent.row_number * 10),
      updated_by = p_actor_id,
      updated_at = now()
  from absent, snapshot_max
  where section.page_key = p_page_key
    and section.id = absent.id;

  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_id, p_actor_label, 'page', p_page_key, 'restore', v_before,
    jsonb_build_object('restoredVersion', p_version)
  );
end;
$$;

create or replace function public.save_page_section_draft(
  p_section_id uuid,
  p_config jsonb,
  p_visible boolean,
  p_actor_id uuid,
  p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_page_key text;
begin
  select page_key, jsonb_build_object('config', draft_config, 'visible', draft_visible)
  into v_page_key, v_before
  from public.page_sections
  where id = p_section_id
  for update;

  if v_page_key is null then raise exception 'Page section not found'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Section configuration must be an object';
  end if;

  update public.page_sections
  set draft_config = p_config,
      draft_visible = case when is_required then true else p_visible end,
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_section_id;

  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  )
  select p_actor_id, p_actor_label, 'page', v_page_key, 'save_draft', v_before,
    jsonb_build_object(
      'sectionId', id, 'sectionKey', section_key,
      'config', draft_config, 'visible', draft_visible
    )
  from public.page_sections where id = p_section_id;
end;
$$;

create or replace function public.reorder_page_draft(
  p_page_key text,
  p_section_ids uuid[],
  p_actor_id uuid,
  p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page_count integer;
  v_distinct_count integer;
  v_before jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));

  select count(*) into v_page_count from public.page_sections where page_key = p_page_key and not draft_deleted;
  select count(distinct id) into v_distinct_count from unnest(p_section_ids) as ids(id);
  if v_page_count = 0 then raise exception 'Page not found'; end if;
  if coalesce(array_length(p_section_ids, 1), 0) <> v_page_count
    or v_distinct_count <> v_page_count
    or exists (
      select 1 from unnest(p_section_ids) as ids(id)
      where not exists (
        select 1 from public.page_sections section
        where section.id = ids.id and section.page_key = p_page_key and not section.draft_deleted
      )
    ) then
    raise exception 'Section order must contain every page section exactly once';
  end if;

  select jsonb_agg(jsonb_build_object('id', id, 'position', draft_position) order by draft_position)
  into v_before from public.page_sections where page_key = p_page_key;

  update public.page_sections
  set draft_position = draft_position + 1000000
  where page_key = p_page_key;

  update public.page_sections section
  set draft_position = ordered.ordinality * 10,
      updated_by = p_actor_id,
      updated_at = now()
  from unnest(p_section_ids) with ordinality as ordered(id, ordinality)
  where section.id = ordered.id and section.page_key = p_page_key and not section.draft_deleted;

  with removed as (
    select id, row_number() over (order by created_at, id) as row_number
    from public.page_sections where page_key = p_page_key and draft_deleted
  )
  update public.page_sections section
  set draft_position = (v_page_count + removed.row_number) * 10
  from removed where section.id = removed.id;

  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_id, p_actor_label, 'page', p_page_key, 'reorder', v_before,
    to_jsonb(p_section_ids)
  );
end;
$$;

create or replace function public.discard_page_draft(
  p_page_key text,
  p_actor_id uuid,
  p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));
  if not exists (select 1 from public.page_sections where page_key = p_page_key) then
    raise exception 'Page not found';
  end if;

  select jsonb_agg(jsonb_build_object(
    'sectionKey', section_key, 'position', draft_position,
    'visible', draft_visible, 'deleted', draft_deleted, 'config', draft_config
  ) order by draft_position) into v_before
  from public.page_sections where page_key = p_page_key;

  update public.page_sections
  set draft_config = published_config,
      draft_visible = published_visible,
      draft_position = published_position,
      draft_deleted = published_deleted,
      updated_by = p_actor_id,
      updated_at = now()
  where page_key = p_page_key;

  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_id, p_actor_label, 'page', p_page_key, 'discard_draft', v_before, null
  );
end;
$$;

create or replace function public.create_page_section_draft(
  p_page_key text, p_section_type text, p_config jsonb,
  p_actor_id uuid, p_actor_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_draft_position integer;
  v_published_position integer;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));
  if p_page_key !~ '^[a-z][a-z0-9-]{0,39}$' then raise exception 'Invalid page key'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'Section configuration must be an object'; end if;
  select coalesce(max(draft_position), 0) + 10, coalesce(max(published_position), 0) + 10
    into v_draft_position, v_published_position
  from public.page_sections where page_key = p_page_key;
  insert into public.page_sections (
    id, page_key, section_key, section_type, draft_position, published_position,
    is_required, draft_config, published_config, draft_visible, published_visible,
    draft_deleted, published_deleted, created_by, updated_by
  ) values (
    v_id, p_page_key, p_section_type || '_' || replace(v_id::text, '-', ''), p_section_type,
    v_draft_position, v_published_position, false, p_config, p_config, true, false,
    false, true, p_actor_id, p_actor_id
  );
  insert into public.audit_logs (actor_id, actor_label, entity_type, entity_id, action, after_value)
  values (p_actor_id, p_actor_label, 'page', p_page_key, 'create',
    jsonb_build_object('sectionId', v_id, 'sectionType', p_section_type));
  return v_id;
end;
$$;

create or replace function public.duplicate_page_section_draft(
  p_section_id uuid, p_actor_id uuid, p_actor_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.page_sections%rowtype;
  v_id uuid := gen_random_uuid();
  v_draft_position integer;
  v_published_position integer;
begin
  select * into v_source from public.page_sections where id = p_section_id and not draft_deleted;
  if v_source.id is null then raise exception 'Page section not found'; end if;
  perform pg_advisory_xact_lock(hashtext('page-studio:' || v_source.page_key));
  select * into v_source from public.page_sections where id = p_section_id and not draft_deleted for update;
  if v_source.id is null then raise exception 'Page section not found'; end if;
  select coalesce(max(draft_position), 0) + 10, coalesce(max(published_position), 0) + 10
    into v_draft_position, v_published_position
  from public.page_sections where page_key = v_source.page_key;
  insert into public.page_sections (
    id, page_key, section_key, section_type, draft_position, published_position,
    is_required, draft_config, published_config, draft_visible, published_visible,
    draft_deleted, published_deleted, created_by, updated_by
  ) values (
    v_id, v_source.page_key, v_source.section_type || '_' || replace(v_id::text, '-', ''),
    v_source.section_type, v_draft_position, v_published_position, false,
    v_source.draft_config, v_source.draft_config, v_source.draft_visible, false,
    false, true, p_actor_id, p_actor_id
  );
  insert into public.audit_logs (actor_id, actor_label, entity_type, entity_id, action, after_value)
  values (p_actor_id, p_actor_label, 'page', v_source.page_key, 'create',
    jsonb_build_object('sectionId', v_id, 'duplicatedFrom', p_section_id));
  return v_id;
end;
$$;

create or replace function public.delete_page_section_draft(
  p_section_id uuid, p_actor_id uuid, p_actor_label text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_section public.page_sections%rowtype;
  v_position integer;
begin
  select * into v_section from public.page_sections where id = p_section_id and not draft_deleted;
  if v_section.id is null then raise exception 'Page section not found'; end if;
  if v_section.is_required then raise exception 'Required sections cannot be removed'; end if;
  perform pg_advisory_xact_lock(hashtext('page-studio:' || v_section.page_key));
  select * into v_section from public.page_sections where id = p_section_id and not draft_deleted for update;
  if v_section.id is null then raise exception 'Page section not found'; end if;
  if v_section.is_required then raise exception 'Required sections cannot be removed'; end if;
  select coalesce(max(draft_position), 0) + 10 into v_position
  from public.page_sections where page_key = v_section.page_key;
  update public.page_sections
  set draft_deleted = true, draft_visible = false, draft_position = v_position,
      updated_by = p_actor_id, updated_at = now()
  where id = p_section_id;
  insert into public.audit_logs (actor_id, actor_label, entity_type, entity_id, action, before_value)
  values (p_actor_id, p_actor_label, 'page', v_section.page_key, 'delete',
    jsonb_build_object('sectionId', p_section_id, 'sectionKey', v_section.section_key));
  return v_section.page_key;
end;
$$;

revoke all on function public.publish_page_draft(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.restore_page_version_to_draft(text, integer, uuid, text)
  from public, anon, authenticated;
revoke all on function public.save_page_section_draft(uuid, jsonb, boolean, uuid, text)
  from public, anon, authenticated;
revoke all on function public.reorder_page_draft(text, uuid[], uuid, text)
  from public, anon, authenticated;
revoke all on function public.discard_page_draft(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.publish_page_draft(text, uuid, text) to service_role;
grant execute on function public.restore_page_version_to_draft(text, integer, uuid, text) to service_role;
grant execute on function public.save_page_section_draft(uuid, jsonb, boolean, uuid, text) to service_role;
grant execute on function public.reorder_page_draft(text, uuid[], uuid, text) to service_role;
grant execute on function public.discard_page_draft(text, uuid, text) to service_role;
revoke all on function public.create_page_section_draft(text, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.duplicate_page_section_draft(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.delete_page_section_draft(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_page_section_draft(text, text, jsonb, uuid, text) to service_role;
grant execute on function public.duplicate_page_section_draft(uuid, uuid, text) to service_role;
grant execute on function public.delete_page_section_draft(uuid, uuid, text) to service_role;

-- ============================================================================
-- PROFILE AVATAR PRIORITY
-- Separates the user-controlled avatar from OAuth-provider-supplied avatar
-- data. avatar_url is the sole manually-uploaded source of truth — only
-- app/api/account/avatar writes to it. provider_avatar_url mirrors the
-- OAuth provider's photo purely as a fallback for when no manual photo has
-- been uploaded yet, kept in sync by the trigger below. See
-- handle_new_user() above (AUTH TRIGGER section) for how both columns are
-- initialized on signup.
-- ============================================================================
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists provider_avatar_url text;

-- Keeps profiles.provider_avatar_url current every time Supabase's GoTrue
-- rewrites auth.users.raw_user_meta_data — identity linking, and every
-- subsequent OAuth sign-in re-syncing the provider's claims. Deliberately
-- touches provider_avatar_url ONLY. It must never write to avatar_url, so a
-- manually uploaded photo can never be overwritten by this trigger no
-- matter how many times the user signs in with Google.
create or replace function public.sync_provider_avatar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set provider_avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_metadata_updated on auth.users;

-- `update of raw_user_meta_data` scopes this to fire only when that column
-- is part of the UPDATE's SET list (identity linking, OAuth metadata
-- re-sync) — ordinary session/token-refresh updates that never touch
-- metadata don't invoke it.
create trigger on_auth_user_metadata_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function public.sync_provider_avatar();

revoke all on function public.sync_provider_avatar() from public;
revoke all on function public.sync_provider_avatar() from anon, authenticated;

-- ============================================================================
-- PAYMOB CARD PAYMENTS (Payment Attempts Architecture + webhook fulfillment)
-- Folded in from supabase/migrations/20260811000001_payment_attempts.sql and
-- supabase/migrations/20260812000001_paymob_webhook_and_paid_fulfillment.sql
-- verbatim, in order — see those files for the full design rationale in
-- comments. Cash on Delivery / place_order() are untouched by any of this.
-- ============================================================================
-- ============================================================================
-- Payment Attempts — Phase 1 (approved Rev. 2 architecture)
-- ============================================================================
-- Durable local record for every Paymob Create-Intention call, plus the
-- schema-only per-bucket fulfillment ledger a later phase will populate.
--
-- Explicitly NOT in this migration: place_paid_order, any write path for
-- private.payment_attempt_fulfillments, the webhook event log, HMAC
-- handling, refunds. place_order/orders/cash-on-delivery are untouched.
--
-- Critical invariant this schema exists to protect (see the approved design
-- doc): PAYMENT CAPTURE and ORDER FULFILLMENT are separate facts. paid_at,
-- once set by a future webhook handler, must never be cleared — no code
-- path in this migration writes paid_at at all yet, but the column exists
-- so that invariant has somewhere durable to live from day one.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ============================================================================
-- public.payment_attempts
-- ============================================================================
create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'paymob' check (provider in ('paymob')),

  provider_intention_id text,
  provider_order_id bigint,
  provider_transaction_id text,
  -- provider_client_secret is intentionally NOT a column (Rev. 2 decision):
  -- client_secret is returned to the browser exactly once, at Create
  -- Intention time, and is never persisted anywhere server-side.
  special_reference text not null unique,

  -- Idempotency. idempotency_actor is always 'user:<uuid>' — card payment
  -- requires auth, so unlike orders.idempotency there is no guest actor
  -- shape here. client_request_id is the client-supplied Idempotency-Key
  -- header; request_hash detects "same key, different payload".
  idempotency_actor text not null check (idempotency_actor ~ '^user:'),
  client_request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),

  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'EGP' check (currency = 'EGP'),

  status text not null default 'created' check (status in (
    'created', 'pending', 'processing', 'paid',
    'reflecting', 'fulfilled', 'fulfillment_failed',
    'failed', 'expired', 'cancelled'
  )),

  -- Resolved cart lines / validated shipping fields at intention-creation
  -- time — see lib/payments/intentionCart.ts. Authoritative for a future
  -- paid order's prices, since that's what was actually charged.
  cart_snapshot jsonb not null,
  shipping_snapshot jsonb not null,
  coupon_snapshot jsonb,

  -- Set only once fulfilled (a later phase) — no FK, since a group spans
  -- multiple orders rows, nothing single-row to reference.
  order_group_id uuid,
  -- A safe, categorized string only (e.g. 'paymob_request_rejected') — see
  -- lib/payments/createIntentionForCart.ts. Never raw provider/Postgres
  -- error text: customers can read this column (see the grant below).
  failure_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz,
  processed_at timestamptz
);

alter table public.payment_attempts enable row level security;

-- Duplicate intentions: a retried request with the same Idempotency-Key can
-- never create a second row, even under real concurrency — Postgres itself
-- enforces this at INSERT time via this index, not application code.
create unique index if not exists payment_attempts_actor_request_idx
  on public.payment_attempts (idempotency_actor, client_request_id);

-- Defense in depth, independent of the app-level idempotency check above.
create unique index if not exists payment_attempts_provider_intention_idx
  on public.payment_attempts (provider, provider_intention_id)
  where provider_intention_id is not null;

create index if not exists payment_attempts_user_id_idx
  on public.payment_attempts (user_id);

create index if not exists payment_attempts_order_group_id_idx
  on public.payment_attempts (order_group_id) where order_group_id is not null;

-- For a future sweep job — kept cheap regardless of table size.
create index if not exists payment_attempts_sweepable_idx
  on public.payment_attempts (expires_at)
  where status in ('created', 'pending', 'processing');

-- ============================================================================
-- RLS / grants — payment_attempts
-- ============================================================================
-- Same shape as the 2026-08-10 privacy migration's treatment of `orders`:
-- broad SELECT revoked, a narrow column grant re-added, a row policy
-- scoping it to the owner. No INSERT/UPDATE/DELETE grant to anon/
-- authenticated exists at all, ever — every write is a SECURITY DEFINER
-- RPC granted to service_role only, identical lockdown to place_order.
revoke all on public.payment_attempts from anon, authenticated;

drop policy if exists "Customers can read their own payment attempts" on public.payment_attempts;
create policy "Customers can read their own payment attempts"
  on public.payment_attempts for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Deliberately excludes cart_snapshot, shipping_snapshot, coupon_snapshot,
-- request_hash, idempotency_actor, client_request_id, and every raw
-- provider id (special_reference, provider_intention_id, provider_order_id,
-- provider_transaction_id) — none of that is "the approved architecture
-- explicitly requires it" territory. failure_reason IS included on purpose:
-- it's already a safe categorized string, and "your card was declined" is
-- useful UX.
grant select (
  id, status, amount_cents, currency, created_at, updated_at,
  paid_at, processed_at, expires_at, order_group_id, failure_reason
) on public.payment_attempts to authenticated;

-- ============================================================================
-- private.payment_attempt_fulfillments — schema only in Phase 1
-- ============================================================================
-- Not written to by any code path yet. place_paid_order (a later,
-- not-yet-approved-for-implementation phase) is what will populate this,
-- one row per fulfillment bucket, with the unique constraint below making
-- its own per-bucket retries idempotent.
create table if not exists private.payment_attempt_fulfillments (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete cascade,
  bucket_key text not null,
  brand_id uuid references public.brands(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'failed')),
  order_id uuid references public.orders(id),
  -- Authoritative source for this value: lib/payments/intentionCart.ts's
  -- computeIntentionAmount() -> buckets[].amountCents (see that file's
  -- module comment for the exact formula: bucket subtotal + that bucket's
  -- shipping allocation, rounded once to piasters; a bucket's discount
  -- allocation is added here only once coupon support ships — not invented
  -- now). sum(expected_amount_cents) over every bucket of one
  -- payment_attempt always equals that attempt's own amount_cents, by
  -- construction of that calculation, not by a separate reconciliation
  -- step run afterward.
  expected_amount_cents integer not null check (expected_amount_cents >= 0),
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  unique (payment_attempt_id, bucket_key)
);

-- Same schema-level lockout as private.order_idempotency /
-- private.coupon_redemptions — the private schema itself already has
-- "revoke all from public, anon, authenticated" above, so no RLS policy is
-- needed on this table at all; it's simply unreachable from anon/
-- authenticated by construction. This also means: customers may never
-- directly access this table, in any way, per the approved architecture.
revoke all on private.payment_attempt_fulfillments from public, anon, authenticated;

-- ============================================================================
-- RPCs — SECURITY DEFINER, service_role only. Mirrors place_order's own
-- lockdown convention exactly (see supabase/migrations/
-- 20260810000005_order_integrity_and_idempotency.sql).
-- ============================================================================

-- Idempotent creation of a payment_attempts row. The unique
-- (idempotency_actor, client_request_id) index above is what actually
-- enforces "the same key can never create two rows" at the database level,
-- even under real concurrency — this function's exception handler only
-- decides what response to build once that constraint fires; it is not
-- itself the source of the safety guarantee.
create or replace function public.create_payment_attempt(
  p_user_id uuid,
  p_idempotency_actor text,
  p_client_request_id uuid,
  p_request_hash text,
  p_amount_cents integer,
  p_currency text,
  p_cart_snapshot jsonb,
  p_shipping_snapshot jsonb,
  p_coupon_snapshot jsonb default null,
  p_expires_in_seconds integer default 3600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_special_reference text;
  v_existing record;
begin
  if p_user_id is null then
    raise exception 'INVALID_USER';
  end if;
  if p_idempotency_actor is null or p_idempotency_actor !~ '^user:' then
    raise exception 'INVALID_IDEMPOTENCY_ACTOR';
  end if;
  if p_client_request_id is null then
    raise exception 'INVALID_CLIENT_REQUEST_ID';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REQUEST_HASH';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_currency is distinct from 'EGP' then
    raise exception 'INVALID_CURRENCY';
  end if;

  -- Generated here (not left to the column default) so the same value can
  -- be used to build special_reference in this same statement — see the
  -- approved architecture's §13: special_reference must be derived from
  -- the payment_attempt's own id, not an arbitrary/disconnected value.
  v_id := gen_random_uuid();
  v_special_reference := 'mahaly_' || v_id::text;

  begin
    insert into public.payment_attempts (
      id, user_id, special_reference, idempotency_actor, client_request_id,
      request_hash, amount_cents, currency, cart_snapshot, shipping_snapshot,
      coupon_snapshot, expires_at
    ) values (
      v_id, p_user_id, v_special_reference, p_idempotency_actor, p_client_request_id,
      p_request_hash, p_amount_cents, p_currency, p_cart_snapshot, p_shipping_snapshot,
      p_coupon_snapshot, now() + make_interval(secs => p_expires_in_seconds)
    );
  exception when unique_violation then
    -- Either the (idempotency_actor, client_request_id) index fired (the
    -- expected, common case: a retried/concurrent request reusing the same
    -- Idempotency-Key) or, in principle, the special_reference unique
    -- constraint did (practically impossible off a fresh gen_random_uuid()).
    select id, special_reference, status, request_hash
    into v_existing
    from public.payment_attempts
    where idempotency_actor = p_idempotency_actor
      and client_request_id = p_client_request_id;

    if not found then
      -- Not the idempotency index — surface the real error rather than
      -- mask an unrelated collision as a replay.
      raise;
    end if;

    if v_existing.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT: key belongs to a different request';
    end if;

    return jsonb_build_object(
      'payment_attempt_id', v_existing.id,
      'special_reference', v_existing.special_reference,
      'status', v_existing.status,
      'replayed', true
    );
  end;

  return jsonb_build_object(
    'payment_attempt_id', v_id,
    'special_reference', v_special_reference,
    'status', 'created',
    'replayed', false
  );
end;
$$;

revoke all on function public.create_payment_attempt(uuid, text, uuid, text, integer, text, jsonb, jsonb, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.create_payment_attempt(uuid, text, uuid, text, integer, text, jsonb, jsonb, jsonb, integer)
  to service_role;

-- created -> pending, once Paymob has confirmed the intention. A
-- compare-and-swap on status (the WHERE clause) — same shape as
-- transition_order_status: a second call once the row is already past
-- 'created' fails loudly (PAYMENT_ATTEMPT_STATUS_CONFLICT) instead of
-- silently overwriting provider ids or resurrecting a terminal row.
create or replace function public.mark_paymob_intention_created(
  p_payment_attempt_id uuid,
  p_provider_intention_id text,
  p_provider_order_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_provider_intention_id is null or btrim(p_provider_intention_id) = '' then
    raise exception 'INVALID_PROVIDER_INTENTION_ID';
  end if;

  update public.payment_attempts
  set status = 'pending',
      provider_intention_id = p_provider_intention_id,
      provider_order_id = p_provider_order_id,
      updated_at = now()
  where id = p_payment_attempt_id
    and status = 'created';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'PAYMENT_ATTEMPT_STATUS_CONFLICT';
  end if;
end;
$$;

revoke all on function public.mark_paymob_intention_created(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.mark_paymob_intention_created(uuid, text, bigint)
  to service_role;

-- created -> failed. p_failure_reason must already be a safe, categorized
-- string by the time it reaches here (see
-- lib/payments/createIntentionForCart.ts's categorizePaymobFailure) —
-- customers can read this column directly (see the grant above), so this
-- function does not, and must not, receive raw provider/Postgres error text.
create or replace function public.mark_paymob_intention_failed(
  p_payment_attempt_id uuid,
  p_failure_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_failure_reason is null or btrim(p_failure_reason) = '' then
    raise exception 'INVALID_FAILURE_REASON';
  end if;

  update public.payment_attempts
  set status = 'failed',
      failure_reason = p_failure_reason,
      updated_at = now()
  where id = p_payment_attempt_id
    and status = 'created';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'PAYMENT_ATTEMPT_STATUS_CONFLICT';
  end if;
end;
$$;

revoke all on function public.mark_paymob_intention_failed(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_paymob_intention_failed(uuid, text)
  to service_role;

-- ============================================================================
-- Paymob webhook + paid-order fulfillment (Card Sandbox v1, remaining scope)
-- ============================================================================
-- Builds on 20260811000001_payment_attempts.sql. Adds:
--   - private.payment_webhook_events (webhook delivery dedup log)
--   - public.mark_payment_attempt_paid / mark_payment_attempt_declined
--     (the ONLY two ways payment_attempts.status can ever become 'paid' or
--     move out of pending/processing — both service_role-only, both called
--     exclusively from the HMAC-verified webhook route)
--   - public.place_paid_order (per-bucket order creation for a paid attempt
--     — does NOT touch place_order/orders' COD path in any way)
--   - public.payment_attempt_fulfillment_summary (ownership-checked, safe
--     for a signed-in customer to call directly)
--   - orders.payment_method widened to allow 'card'; orders.payment_attempt_id
--   - a minimal manual-refund audit marker on payment_attempts, so two admins
--     (or one admin double-clicking) can't both process the same refund
--
-- Explicitly NOT in this migration: HMAC verification itself (that's
-- application code — see lib/payments/paymobWebhook.ts — Postgres never
-- sees the secret or the raw request), saved cards, MOTO, wallets,
-- subscriptions, split payments, automatic refund API calls.
--
-- Critical invariant preserved by construction: PAYMENT CAPTURE and ORDER
-- FULFILLMENT are separate, non-reversible-into-each-other facts.
-- mark_payment_attempt_paid never runs any fulfillment logic itself and
-- commits as its own independent statement; place_paid_order can fail,
-- crash, or be retried any number of times afterward without ever being
-- able to un-set paid_at — no function anywhere in this file contains an
-- UPDATE that clears paid_at, and mark_payment_attempt_declined explicitly
-- refuses to touch a payment_attempt that has already moved past
-- pending/processing.
-- ============================================================================

-- ============================================================================
-- private.payment_webhook_events — delivery-level idempotency log
-- ============================================================================
create table if not exists private.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paymob',
  provider_event_id text not null,
  payment_attempt_id uuid references public.payment_attempts(id),
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
revoke all on private.payment_webhook_events from public, anon, authenticated;

-- ============================================================================
-- payment_attempts additions: manual-refund audit marker
-- ============================================================================
-- Deliberately minimal, per the approved architecture's §14/§17: this does
-- NOT call any refund API and does NOT compute refund amounts on its own —
-- it only records "an admin says this was handled", once, so a second
-- admin (or the same admin refreshing a stale screen) can't double-process
-- the same refund. The actual amount owed is still whatever
-- payment_attempt_fulfillment_summary()/the ledger already make computable.
alter table public.payment_attempts add column if not exists refunded_at timestamptz;
alter table public.payment_attempts add column if not exists refund_note text;
alter table public.payment_attempts add column if not exists refunded_by uuid references auth.users(id) on delete set null;

-- ============================================================================
-- orders: allow 'card' as a payment_method, and trace an order back to the
-- payment_attempt that produced it. Cash on Delivery's own default/behavior
-- is completely unchanged — 'cash_on_delivery' remains valid and remains
-- the default place_order() always uses.
-- ============================================================================
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cash_on_delivery', 'card'));

alter table public.orders add column if not exists payment_attempt_id uuid
  references public.payment_attempts(id);
create index if not exists orders_payment_attempt_id_idx
  on public.orders (payment_attempt_id) where payment_attempt_id is not null;

-- ============================================================================
-- mark_payment_attempt_paid — the ONLY function that may ever set
-- payment_attempts.status = 'paid'. Called exactly once per verified
-- webhook delivery, from the webhook route, after HMAC verification has
-- already passed. Runs and commits as its own independent statement —
-- deliberately NOT combined with place_paid_order in the same call, so a
-- later crash/exception in fulfillment can never roll back the paid fact
-- recorded here.
-- ============================================================================
create or replace function public.mark_payment_attempt_paid(
  p_payment_attempt_id uuid,
  p_provider_transaction_id text,
  p_provider_event_id text,
  p_amount_cents integer,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted int;
  v_attempt record;
begin
  if p_provider_event_id is null or btrim(p_provider_event_id) = '' then
    raise exception 'INVALID_PROVIDER_EVENT_ID';
  end if;

  -- Log first, then decide whether to process — a redelivered event (same
  -- transaction id) is caught here before touching payment state at all.
  insert into private.payment_webhook_events (provider, provider_event_id, payment_attempt_id)
  values ('paymob', p_provider_event_id, p_payment_attempt_id)
  on conflict (provider, provider_event_id) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then
    raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  if v_inserted = 0 then
    return jsonb_build_object('payment_attempt_id', v_attempt.id, 'status', v_attempt.status, 'replayed', true);
  end if;

  -- Already paid (or further along) — idempotent no-op. paid_at is never
  -- re-set, never touched a second time.
  if v_attempt.status in ('paid', 'reflecting', 'fulfilled', 'fulfillment_failed') then
    return jsonb_build_object('payment_attempt_id', v_attempt.id, 'status', v_attempt.status, 'replayed', true);
  end if;

  if v_attempt.status not in ('pending', 'processing') then
    raise exception 'PAYMENT_ATTEMPT_STATE_ANOMALY: current status is %, expected pending/processing', v_attempt.status;
  end if;

  if p_amount_cents is distinct from v_attempt.amount_cents or p_currency is distinct from v_attempt.currency then
    raise exception 'AMOUNT_MISMATCH: attempt expects % % but webhook reported % %',
      v_attempt.amount_cents, v_attempt.currency, p_amount_cents, p_currency;
  end if;

  update public.payment_attempts
  set status = 'paid',
      paid_at = now(),
      provider_transaction_id = p_provider_transaction_id,
      updated_at = now()
  where id = p_payment_attempt_id;

  return jsonb_build_object('payment_attempt_id', p_payment_attempt_id, 'status', 'paid', 'replayed', false);
end;
$$;

revoke all on function public.mark_payment_attempt_paid(uuid, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.mark_payment_attempt_paid(uuid, text, text, integer, text)
  to service_role;

-- ============================================================================
-- mark_payment_attempt_declined — a webhook-reported failure/decline.
-- Refuses to touch an attempt that has already moved past pending/
-- processing, so a late or out-of-order "declined" event can never undo an
-- already-recorded 'paid' fact.
-- ============================================================================
create or replace function public.mark_payment_attempt_declined(
  p_payment_attempt_id uuid,
  p_provider_transaction_id text,
  p_provider_event_id text,
  p_failure_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted int;
  v_attempt record;
begin
  if p_provider_event_id is null or btrim(p_provider_event_id) = '' then
    raise exception 'INVALID_PROVIDER_EVENT_ID';
  end if;
  if p_failure_reason is null or btrim(p_failure_reason) = '' then
    raise exception 'INVALID_FAILURE_REASON';
  end if;

  insert into private.payment_webhook_events (provider, provider_event_id, payment_attempt_id)
  values ('paymob', p_provider_event_id, p_payment_attempt_id)
  on conflict (provider, provider_event_id) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then
    raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  if v_inserted = 0 then
    return jsonb_build_object('payment_attempt_id', v_attempt.id, 'status', v_attempt.status, 'replayed', true);
  end if;

  if v_attempt.status not in ('pending', 'processing') then
    -- Includes the "already paid" case — never overwrite a paid attempt
    -- with a decline, no matter what order the events arrive in.
    return jsonb_build_object('payment_attempt_id', v_attempt.id, 'status', v_attempt.status, 'replayed', true);
  end if;

  update public.payment_attempts
  set status = 'failed',
      failure_reason = p_failure_reason,
      provider_transaction_id = p_provider_transaction_id,
      updated_at = now()
  where id = p_payment_attempt_id;

  return jsonb_build_object('payment_attempt_id', p_payment_attempt_id, 'status', 'failed', 'replayed', false);
end;
$$;

revoke all on function public.mark_payment_attempt_declined(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mark_payment_attempt_declined(uuid, text, text, text)
  to service_role;

-- ============================================================================
-- place_paid_order — per-bucket order creation for an already-'paid'
-- attempt. Mirrors place_order()'s own bucketing (partner pool vs. one
-- order per independent brand — see supabase/migrations/
-- 20260807000001_brand_partner_fulfillment_and_order_splitting.sql) but is
-- a fully independent function: place_order() itself is not modified,
-- referenced, or called by this function in any way, so Cash on Delivery
-- cannot be affected by anything in this migration.
--
-- Retry-safe: the `for update` row lock on payment_attempts serializes
-- concurrent calls for the same attempt; an attempt already 'fulfilled' or
-- 'fulfillment_failed' short-circuits immediately; a bucket the ledger
-- already shows 'fulfilled' is skipped on any later call. Each bucket is
-- attempted inside its own BEGIN/EXCEPTION block (PL/pgSQL's real
-- subtransaction mechanism — see the approved architecture's §4 for why
-- explicit SAVEPOINT statements are not usable here), so one bucket's
-- stock/data conflict can never undo a sibling bucket that already
-- committed.
-- ============================================================================
create or replace function public.place_paid_order(p_payment_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
  v_group_id uuid;
  v_bucket_keys text[] := '{}';
  v_bucket_key text;
  v_item jsonb;
  v_brand_slug text;
  v_is_partner boolean;
  v_order_id uuid;
  v_order_number text;
  v_variant_id uuid;
  v_quantity int;
  v_price numeric(10, 2);
  v_currency text;
  v_line_total numeric(10, 2);
  v_updated int;
  v_subtotal_usd numeric(10, 2);
  v_subtotal_egp numeric(10, 2);
  v_bucket_fulfillment_type text;
  v_bucket_brand_slug text;
  v_bucket_brand_id uuid;
  v_shipping_fee numeric(10, 2);
  v_flat_fee numeric(10, 2);
  v_free_threshold numeric(10, 2);
  v_shipping_settings jsonb;
  v_attempt_no int;
  v_any_fulfilled boolean;
  v_any_failed boolean;
begin
  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then
    raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.status in ('fulfilled', 'fulfillment_failed') then
    return jsonb_build_object(
      'payment_attempt_id', p_payment_attempt_id,
      'status', v_attempt.status,
      'order_group_id', v_attempt.order_group_id,
      'replayed', true
    );
  end if;

  if v_attempt.status not in ('paid', 'reflecting') then
    raise exception 'PAYMENT_ATTEMPT_NOT_PAID: current status is %, expected paid', v_attempt.status;
  end if;

  if v_attempt.status = 'paid' then
    update public.payment_attempts set status = 'reflecting', updated_at = now() where id = p_payment_attempt_id;
  end if;

  v_group_id := coalesce(v_attempt.order_group_id, gen_random_uuid());

  select value into v_shipping_settings from public.site_content where key = 'shipping_settings';
  v_flat_fee := coalesce((v_shipping_settings ->> 'flatDeliveryFeeEgp')::numeric, 50);
  v_free_threshold := coalesce((v_shipping_settings ->> 'freeShippingThresholdEgp')::numeric, 1500);

  -- Pass 1: distinct bucket keys — identical rule to place_order(): a
  -- Zakhnook-partner brand (or a missing brand attribution) pools into
  -- '__mahaly_pool__'; every other brand gets its own key.
  for v_item in select * from jsonb_array_elements(v_attempt.cart_snapshot)
  loop
    v_brand_slug := nullif(v_item ->> 'brandSlug', '');
    v_is_partner := false;
    if v_brand_slug is not null then
      select coalesce(is_mahaly_partner, false) into v_is_partner from public.brands where slug = v_brand_slug;
    end if;
    v_bucket_key := case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end;
    if not (v_bucket_key = any(v_bucket_keys)) then
      v_bucket_keys := array_append(v_bucket_keys, v_bucket_key);
    end if;
  end loop;

  -- Pass 2: one bucket at a time, each isolated.
  for v_bucket_key in select unnest(v_bucket_keys)
  loop
    if exists (
      select 1 from private.payment_attempt_fulfillments
      where payment_attempt_id = p_payment_attempt_id and bucket_key = v_bucket_key and status = 'fulfilled'
    ) then
      continue;
    end if;

    begin
      v_bucket_fulfillment_type := case when v_bucket_key = '__mahaly_pool__' then 'mahaly_pool' else 'brand_direct' end;
      v_bucket_brand_slug := case when v_bucket_key = '__mahaly_pool__' then null else v_bucket_key end;
      v_bucket_brand_id := null;
      if v_bucket_brand_slug is not null then
        select id into v_bucket_brand_id from public.brands where slug = v_bucket_brand_slug;
      end if;

      v_subtotal_usd := 0;
      v_subtotal_egp := 0;

      v_attempt_no := 0;
      loop
        v_order_number := 'LC-' || floor(100000 + random() * 900000)::text;
        begin
          insert into public.orders (
            order_number, user_id, status, payment_method, payment_status, payment_attempt_id,
            shipping_name, shipping_email, shipping_phone, shipping_address, shipping_city, shipping_governorate,
            subtotal_usd, subtotal_egp, order_group_id, fulfillment_type, brand_slug
          ) values (
            v_order_number, v_attempt.user_id, 'paid', 'card', 'paid', p_payment_attempt_id,
            btrim(coalesce(v_attempt.shipping_snapshot ->> 'firstName', '') || ' ' || coalesce(v_attempt.shipping_snapshot ->> 'lastName', '')),
            v_attempt.shipping_snapshot ->> 'email',
            v_attempt.shipping_snapshot ->> 'phone',
            v_attempt.shipping_snapshot ->> 'address',
            v_attempt.shipping_snapshot ->> 'city',
            v_attempt.shipping_snapshot ->> 'governorate',
            0, 0, v_group_id, v_bucket_fulfillment_type, v_bucket_brand_slug
          )
          returning id into v_order_id;
          exit;
        exception when unique_violation then
          v_attempt_no := v_attempt_no + 1;
          if v_attempt_no >= 5 then
            raise exception 'Could not generate a unique order number';
          end if;
        end;
      end loop;

      for v_item in select * from jsonb_array_elements(v_attempt.cart_snapshot)
      loop
        v_brand_slug := nullif(v_item ->> 'brandSlug', '');
        v_is_partner := false;
        if v_brand_slug is not null then
          select coalesce(is_mahaly_partner, false) into v_is_partner from public.brands where slug = v_brand_slug;
        end if;
        if (case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end) <> v_bucket_key then
          continue;
        end if;

        v_quantity := (v_item ->> 'quantity')::int;
        v_price := (v_item ->> 'price')::numeric;
        v_currency := v_item ->> 'currency';
        v_variant_id := nullif(v_item ->> 'variantId', '')::uuid;

        if v_variant_id is not null then
          update public.product_variants
          set quantity = quantity - v_quantity, updated_at = now()
          where id = v_variant_id and quantity >= v_quantity and selling_status = 'active';

          get diagnostics v_updated = row_count;
          if v_updated = 0 then
            raise exception 'INSUFFICIENT_STOCK: %', v_item ->> 'name';
          end if;
        end if;

        insert into public.order_items (
          order_id, product_id, variant_id, name, brand, brand_slug, price, currency, size, color, quantity, image
        ) values (
          v_order_id, v_item ->> 'productId', v_variant_id, v_item ->> 'name', v_item ->> 'brand',
          v_brand_slug, v_price, v_currency, v_item ->> 'size', nullif(v_item ->> 'color', ''), v_quantity, ''
        );

        v_line_total := v_price * v_quantity;
        if v_currency = 'EGP' then
          v_subtotal_egp := v_subtotal_egp + v_line_total;
        else
          v_subtotal_usd := v_subtotal_usd + v_line_total;
        end if;
      end loop;

      if v_subtotal_egp >= v_free_threshold then
        v_shipping_fee := 0;
      else
        v_shipping_fee := v_flat_fee;
      end if;

      update public.orders
      set subtotal_usd = v_subtotal_usd, subtotal_egp = v_subtotal_egp, shipping_fee_egp = v_shipping_fee
      where id = v_order_id;

      insert into public.order_status_history (order_id, status, note)
      values (v_order_id, 'paid', 'Card payment confirmed via Paymob webhook');

      insert into private.payment_attempt_fulfillments (
        payment_attempt_id, bucket_key, brand_id, status, order_id, expected_amount_cents, fulfilled_at
      ) values (
        p_payment_attempt_id, v_bucket_key, v_bucket_brand_id, 'fulfilled', v_order_id,
        round((v_subtotal_egp + v_shipping_fee) * 100)::int, now()
      )
      on conflict (payment_attempt_id, bucket_key) do update set
        status = 'fulfilled',
        order_id = excluded.order_id,
        expected_amount_cents = excluded.expected_amount_cents,
        failure_reason = null,
        fulfilled_at = now(),
        updated_at = now();

    exception when others then
      insert into private.payment_attempt_fulfillments (
        payment_attempt_id, bucket_key, brand_id, status, expected_amount_cents, failure_reason
      ) values (
        p_payment_attempt_id, v_bucket_key, v_bucket_brand_id, 'failed', 0, sqlerrm
      )
      on conflict (payment_attempt_id, bucket_key) do update set
        status = 'failed',
        failure_reason = excluded.failure_reason,
        updated_at = now();
    end;
  end loop;

  select
    coalesce(bool_or(status = 'fulfilled'), false),
    coalesce(bool_or(status = 'failed'), false)
  into v_any_fulfilled, v_any_failed
  from private.payment_attempt_fulfillments
  where payment_attempt_id = p_payment_attempt_id;

  if v_any_fulfilled then
    update public.payment_attempts
    set status = 'fulfilled', order_group_id = v_group_id, processed_at = now(), updated_at = now()
    where id = p_payment_attempt_id;
  else
    update public.payment_attempts
    set status = 'fulfillment_failed', processed_at = now(), updated_at = now()
    where id = p_payment_attempt_id;
  end if;

  return jsonb_build_object(
    'payment_attempt_id', p_payment_attempt_id,
    'status', case when v_any_fulfilled then 'fulfilled' else 'fulfillment_failed' end,
    'order_group_id', case when v_any_fulfilled then v_group_id else null end,
    'is_partial', (v_any_fulfilled and v_any_failed),
    'replayed', false
  );
end;
$$;

revoke all on function public.place_paid_order(uuid) from public, anon, authenticated;
grant execute on function public.place_paid_order(uuid) to service_role;

-- ============================================================================
-- payment_attempt_fulfillment_summary — ownership-checked, safe to grant
-- directly to authenticated (a customer's own status page can call it).
-- ============================================================================
create or replace function public.payment_attempt_fulfillment_summary(p_payment_attempt_id uuid)
returns table (total_buckets int, fulfilled_buckets int, failed_buckets int, is_partial boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::int,
    count(*) filter (where f.status = 'fulfilled')::int,
    count(*) filter (where f.status = 'failed')::int,
    (count(*) filter (where f.status = 'fulfilled') > 0 and count(*) filter (where f.status = 'failed') > 0)
  from private.payment_attempt_fulfillments f
  join public.payment_attempts pa on pa.id = f.payment_attempt_id
  where f.payment_attempt_id = p_payment_attempt_id
    and pa.user_id = (select auth.uid());
$$;

revoke all on function public.payment_attempt_fulfillment_summary(uuid) from public;
grant execute on function public.payment_attempt_fulfillment_summary(uuid) to authenticated, service_role;

-- ============================================================================
-- mark_payment_attempt_refund_recorded — the smallest safe manual-refund
-- audit marker: records that an admin has handled a refund outside this
-- system (no Paymob Refund API call happens anywhere here), and refuses to
-- let it be recorded twice — preventing two admins (or one admin
-- double-clicking a stale screen) from both processing the same refund.
-- ============================================================================
create or replace function public.mark_payment_attempt_refund_recorded(
  p_payment_attempt_id uuid,
  p_actor_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
begin
  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then
    raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.refunded_at is not null then
    raise exception 'ALREADY_MARKED_REFUNDED';
  end if;

  if v_attempt.status not in ('fulfillment_failed', 'fulfilled') then
    raise exception 'PAYMENT_ATTEMPT_NOT_REFUND_ELIGIBLE: status is %', v_attempt.status;
  end if;

  update public.payment_attempts
  set refunded_at = now(),
      refund_note = p_note,
      refunded_by = p_actor_id,
      updated_at = now()
  where id = p_payment_attempt_id;

  return jsonb_build_object('payment_attempt_id', p_payment_attempt_id, 'refunded_at', now());
end;
$$;

revoke all on function public.mark_payment_attempt_refund_recorded(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_payment_attempt_refund_recorded(uuid, uuid, text)
  to service_role;

-- ============================================================================
-- list_payment_attempts_needing_refund_review — admin visibility (§16).
-- private.payment_attempt_fulfillments has no PostgREST surface at all (the
-- `private` schema is never exposed to the API), so this is the only way
-- for an admin route to read it — service_role-only, called from a
-- requireStaffRole("admin")-gated API route, same convention as every
-- other admin data read in this codebase.
-- ============================================================================
create or replace function public.list_payment_attempts_needing_refund_review()
returns table (
  payment_attempt_id uuid,
  user_id uuid,
  status text,
  amount_cents integer,
  currency text,
  is_partial boolean,
  refund_amount_cents integer,
  refunded_at timestamptz,
  refund_note text,
  created_at timestamptz,
  paid_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pa.id,
    pa.user_id,
    pa.status,
    pa.amount_cents,
    pa.currency,
    exists (
      select 1 from private.payment_attempt_fulfillments f
      where f.payment_attempt_id = pa.id and f.status = 'fulfilled'
    ) and exists (
      select 1 from private.payment_attempt_fulfillments f
      where f.payment_attempt_id = pa.id and f.status = 'failed'
    ) as is_partial,
    coalesce(
      (
        select sum(f.expected_amount_cents)::int
        from private.payment_attempt_fulfillments f
        where f.payment_attempt_id = pa.id and f.status = 'failed'
      ),
      case when pa.status = 'fulfillment_failed' then pa.amount_cents else 0 end
    ) as refund_amount_cents,
    pa.refunded_at,
    pa.refund_note,
    pa.created_at,
    pa.paid_at
  from public.payment_attempts pa
  where pa.status = 'fulfillment_failed'
     or (
       pa.status = 'fulfilled'
       and exists (
         select 1 from private.payment_attempt_fulfillments f
         where f.payment_attempt_id = pa.id and f.status = 'failed'
       )
     )
  order by pa.paid_at desc nulls last, pa.created_at desc;
$$;

revoke all on function public.list_payment_attempts_needing_refund_review() from public, anon, authenticated;
grant execute on function public.list_payment_attempts_needing_refund_review() to service_role;
