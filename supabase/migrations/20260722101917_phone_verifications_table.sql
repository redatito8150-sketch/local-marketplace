-- OTP tracking for phone verification (app/api/account/phone/*). Phone is
-- modeled here as a secondary claim on profiles, not a second auth.users
-- identifier — email stays the sole login identity, so this table (not
-- Supabase's native phone-auth flow) is the source of truth for "is this
-- phone number actually confirmed."
create table if not exists public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phone text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists phone_verifications_user_id_idx on public.phone_verifications (user_id);

-- Never read from the browser at all (send-otp/verify-otp both go through
-- service_role) — no select policy for anon/authenticated, same pattern as
-- audit_logs.
alter table public.phone_verifications enable row level security;
