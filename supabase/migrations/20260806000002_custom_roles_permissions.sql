-- Custom, Discord-style admin roles: an admin creates a named role,
-- toggles which permissions it grants, and assigns it to staff accounts —
-- replacing the fixed staff/manager/admin rank as the source of truth for
-- what an admin account can actually do (the account still needs
-- profiles.is_admin=true to reach /admin at all — that hard floor is
-- untouched; roles control what happens once inside).
--
-- Four tables:
-- - permissions: a fixed catalog (not admin-editable, like Discord's own
--   permission bits) — seeded below, one row per real gated capability.
-- - roles: admin-created/named, with is_protected marking the built-in
--   defaults (Admin/Manager/Staff) so they can't be deleted.
-- - role_permissions: which permissions a role grants.
-- - user_roles: which roles a user holds (many-to-many — a user can hold
--   more than one role, same as Discord).
--
-- All four are admin-only: RLS enabled with zero public/authenticated
-- policies, every read/write goes through supabaseAdmin server-side, same
-- convention as every other admin-management table in this project.

create table if not exists public.permissions (
  key text primary key,
  label text not null,
  description text not null,
  category text not null,
  sort_order int not null default 0
);
alter table public.permissions enable row level security;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  color text,
  is_protected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.roles enable row level security;

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);
alter table public.role_permissions enable row level security;

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  primary key (user_id, role_id)
);
alter table public.user_roles enable row level security;
create index if not exists user_roles_user_id_idx on public.user_roles (user_id);
create index if not exists user_roles_role_id_idx on public.user_roles (role_id);

-- ── Fixed permission catalog ────────────────────────────────────────────
-- Each key maps to a real, currently-gated admin capability — not
-- aspirational. category groups them for the UI (mirrors Discord's
-- "General/Membership/Text Channel..." grouping).
insert into public.permissions (key, label, description, category, sort_order) values
  ('manage_products', 'Manage Products', 'Create, edit, publish, archive, and bulk-manage products across every brand.', 'Catalog', 10),
  ('manage_inventory', 'Manage Inventory', 'Adjust stock levels and view inventory movement history for any brand.', 'Catalog', 20),
  ('manage_collections', 'Manage Collections', 'Create, edit, and archive product collections.', 'Catalog', 30),
  ('manage_orders', 'Manage Orders', 'View orders, change order status, add internal notes, and export order data.', 'Commerce', 40),
  ('manage_coupons', 'Manage Coupons', 'Create, edit, and delete discount coupons.', 'Commerce', 50),
  ('manage_brands', 'Manage Brands', 'Create and edit brand profiles, and link/unlink brand owner accounts.', 'Brands', 60),
  ('manage_applications', 'Manage Brand Applications', 'Review, approve, reject, and request changes on brand applications, and create brands from approved ones.', 'Brands', 70),
  ('moderate_reviews', 'Moderate Reviews', 'Approve, hide, or remove customer product reviews.', 'Community', 80),
  ('manage_page_studio', 'Manage Page Studio', 'Edit and publish homepage sections and layout.', 'Content', 90),
  ('manage_site_content', 'Manage Site Content', 'Edit category heroes, the journal, hero tiles, and other marketing content.', 'Content', 100),
  ('manage_users', 'Manage Users', 'View and search every account on the platform.', 'Administration', 110),
  ('manage_roles', 'Manage Roles', 'Create, edit, and delete roles, and assign or remove them from accounts. Extremely sensitive — only grant this to fully trusted admins.', 'Administration', 120)
on conflict (key) do nothing;

-- ── Default protected roles ──────────────────────────────────────────────
-- Seeded so the page is never empty on first load, and so every existing
-- staff/manager/admin account keeps equivalent access after this ships
-- (see the backfill below) — is_protected=true means the UI refuses to
-- delete them (renaming/re-permissioning is still allowed).
insert into public.roles (name, description, color, is_protected) values
  ('Admin', 'Full access to everything, including managing roles. Matches the legacy "admin" rank.', '#B71F1A', true),
  ('Manager', 'Full catalog, commerce, brand, and content access, but cannot manage roles or user access.', '#C08B3A', true),
  ('Staff', 'Day-to-day operations: orders, products, inventory, and review moderation.', '#4A7A6F', true)
on conflict (name) do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join public.permissions p
where r.name = 'Admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join public.permissions p
where r.name = 'Manager'
  and p.key in (
    'manage_products', 'manage_inventory', 'manage_collections', 'manage_orders',
    'manage_coupons', 'manage_brands', 'manage_applications', 'moderate_reviews',
    'manage_page_studio', 'manage_site_content', 'manage_users'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join public.permissions p
where r.name = 'Staff'
  and p.key in ('manage_products', 'manage_inventory', 'manage_orders', 'moderate_reviews')
on conflict do nothing;

-- ── Backfill: every existing admin-rank account gets the matching role ──
-- so nobody's access silently changes just because this table now exists.
insert into public.user_roles (user_id, role_id)
select pr.id, r.id
from public.profiles pr
join public.roles r on r.name = initcap(pr.role)
where pr.is_admin = true
  and pr.role in ('staff', 'manager', 'admin')
on conflict do nothing;

-- Admin/service-role only — no public or authenticated policy on any of
-- the four tables (matches the admin-only `notifications` table's
-- convention exactly).
