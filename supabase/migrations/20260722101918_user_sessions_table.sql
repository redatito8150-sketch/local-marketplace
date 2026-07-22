-- A self-reported device registry for the account security page's "your
-- devices" list (app/api/account/sessions/*). Not a live session store —
-- Supabase Auth itself owns real session/token validity. Each browser
-- generates its own random device_id once (localStorage) and "touches" this
-- table on sign-in so the security page has something to list and let a
-- user revoke by device; actually forcing every *other* device's Supabase
-- session to end still goes through supabase.auth.signOut({scope:'others'})
-- client-side, which this table doesn't replace.
create table if not exists public.user_sessions (
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

create index if not exists user_sessions_user_id_idx on public.user_sessions (user_id);

alter table public.user_sessions enable row level security;

-- Only the owning user can read their own device list; all writes go
-- through service_role in app/api/account/sessions/*, same convention as
-- addresses/orders.
drop policy if exists "Users can read their own sessions" on public.user_sessions;
create policy "Users can read their own sessions"
  on public.user_sessions for select
  to authenticated
  using (auth.uid() = user_id);
