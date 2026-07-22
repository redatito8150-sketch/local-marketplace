-- The addresses feature (lib/data/addresses.ts, app/api/account/addresses/*)
-- has been calling a table and an RPC that never existed in this repo's
-- schema — every read/write against `addresses` or `set_default_address()`
-- has been failing (or silently relying on an undocumented table created by
-- hand in the live project). This migration is the real source of truth,
-- shaped to match the columns the existing application code already reads
-- and writes (first_name/last_name/phone/address_line/city/governorate),
-- so no application code changes are needed for this migration alone.

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default 'Home',
  first_name text not null,
  last_name text not null,
  phone text not null,
  address_line text not null,
  city text not null,
  governorate text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists addresses_user_id_idx on public.addresses (user_id);

alter table public.addresses enable row level security;

-- No public "list everyone" policy — only the owning user can read their own
-- rows. All writes go through service_role in app/api/account/addresses/*,
-- same convention as orders/order_items (see schema.sql's note on that).
drop policy if exists "Users can read their own addresses" on public.addresses;
create policy "Users can read their own addresses"
  on public.addresses for select
  to authenticated
  using (auth.uid() = user_id);

-- Atomic default-address swap: clears is_default on every other address the
-- user owns and sets it on the target row in one statement, so there's never
-- a window with zero or two defaults. Ownership is re-checked inside the
-- function (p_user_id must match the row's user_id), not just trusted from
-- the caller, since this runs as security definer.
create or replace function public.set_default_address(p_user_id uuid, p_address_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.addresses
  set is_default = (id = p_address_id), updated_at = now()
  where user_id = p_user_id
    and (is_default = true or id = p_address_id);
end;
$$;

revoke all on function public.set_default_address(uuid, uuid) from public;
revoke all on function public.set_default_address(uuid, uuid) from anon, authenticated;
grant execute on function public.set_default_address(uuid, uuid) to service_role;

-- Non-authoritative link from an order back to the address it came from, for
-- admin traceability only. The authoritative shipping data is (and stays)
-- the flat shipping_* snapshot columns on orders — this FK is never read to
-- reconstruct a shipment, only to jump from an order to "which saved address
-- was this," and disappears harmlessly if the address is later deleted.
alter table public.orders
  add column if not exists address_id uuid references public.addresses (id) on delete set null;

-- profiles.phone already referenced by app/account/(dashboard)/overview and
-- the addresses API, but was never defined in this repo's schema — add it
-- (and a verified-at column for the phone verification feature) explicitly
-- rather than continuing to rely on an undocumented live column.
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists phone_verified_at timestamptz;
