-- Account-lifecycle hardening.
--
-- Goals:
--   * account deletion cannot be performed from an old/stolen session;
--   * deleting an auth user cannot be blocked by historical review/application FKs;
--   * retained order rows contain no customer contact/address snapshot;
--   * storage cleanup is durable and retryable;
--   * profiles.email follows a confirmed auth.users email change.

begin;

-- The service-only API uses the verified JWT's session_id and this helper to
-- distinguish a freshly established login from an access-token refresh.
create or replace function public.is_recent_auth_session(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions s
    where s.id = p_session_id
      and s.user_id = p_user_id
      and s.created_at >= now() - interval '15 minutes'
  );
$$;

revoke all on function public.is_recent_auth_session(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.is_recent_auth_session(uuid, uuid)
  to service_role;

-- Keep a durable record before deleting auth/DB rows so a transient Storage
-- error cannot strand an object without any remaining cleanup reference.
create table if not exists public.storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid,
  bucket_id text not null,
  storage_path text not null,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, storage_path)
);

alter table public.storage_cleanup_jobs enable row level security;
revoke all on public.storage_cleanup_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.storage_cleanup_jobs to service_role;

-- Historical/admin attribution must not make an account undeletable.
alter table public.brand_applications
  drop constraint if exists brand_applications_reviewed_by_fkey,
  drop constraint if exists brand_applications_converted_by_fkey;
alter table public.brand_applications
  add constraint brand_applications_reviewed_by_fkey
    foreign key (reviewed_by) references auth.users(id) on delete set null,
  add constraint brand_applications_converted_by_fkey
    foreign key (converted_by) references auth.users(id) on delete set null;

alter table public.brand_application_documents
  drop constraint if exists brand_application_documents_uploaded_by_fkey;
alter table public.brand_application_documents
  add constraint brand_application_documents_uploaded_by_fkey
    foreign key (uploaded_by) references auth.users(id) on delete set null;

alter table public.brand_application_status_history
  drop constraint if exists brand_application_status_history_changed_by_fkey;
alter table public.brand_application_status_history
  add constraint brand_application_status_history_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;

alter table public.brand_application_revisions
  drop constraint if exists brand_application_revisions_application_id_fkey;
alter table public.brand_application_revisions
  add constraint brand_application_revisions_application_id_fkey
    foreign key (application_id) references public.brand_applications(id) on delete cascade;

alter table public.brand_application_information_requests
  alter column requested_by drop not null,
  drop constraint if exists brand_application_information_requests_application_id_fkey,
  drop constraint if exists brand_application_information_requests_requested_by_fkey;
alter table public.brand_application_information_requests
  add constraint brand_application_information_requests_application_id_fkey
    foreign key (application_id) references public.brand_applications(id) on delete cascade,
  add constraint brand_application_information_requests_requested_by_fkey
    foreign key (requested_by) references auth.users(id) on delete set null;

-- A converted brand is a business record and must survive its original
-- applicant deleting their customer account. Only the application link goes.
alter table public.brands
  drop constraint if exists brands_source_application_id_fkey;
alter table public.brands
  add constraint brands_source_application_id_fkey
    foreign key (source_application_id) references public.brand_applications(id) on delete set null;

create or replace function public.prepare_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reviews are user-authored content. Remove the rows (and their image rows,
  -- replies, votes and reports through cascades) rather than retaining a
  -- public body which may contain personal information.
  delete from public.reviews where user_id = old.id;
  delete from public.review_replies where replied_by = old.id;

  -- Orders remain for transaction/accounting integrity, but all direct
  -- customer identifiers and admin notes are removed before user_id is set
  -- null by its FK action.
  update public.orders
  set shipping_name = 'Deleted account',
      shipping_email = 'deleted+' || id::text || '@example.invalid',
      shipping_phone = 'REDACTED',
      shipping_address = 'REDACTED',
      shipping_city = 'REDACTED',
      shipping_governorate = 'REDACTED',
      address_id = null,
      internal_notes = null
  where user_id = old.id;

  return old;
end;
$$;

revoke all on function public.prepare_account_deletion()
  from public, anon, authenticated;
drop trigger if exists before_auth_user_deleted on auth.users;
create trigger before_auth_user_deleted
  before delete on auth.users
  for each row execute function public.prepare_account_deletion();

create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;
  return new;
end;
$$;

revoke all on function public.sync_profile_email_from_auth()
  from public, anon, authenticated;
drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email_from_auth();

commit;
