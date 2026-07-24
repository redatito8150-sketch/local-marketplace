-- Brand application system rebuild (feature/brand-application-redesign).
-- Extends the existing brand_applications table (never renaming/dropping any
-- existing column) rather than replacing it, and adds two new supporting
-- tables. See the approved plan for full context.
--
-- Historical rows predate any applicant-account link, so applicant_user_id
-- stays NULLable at the DB level — old rows are preserved as read-only
-- "legacy" records, never backfilled with a guessed identity. Every new
-- write path (application code) always sets it from the authenticated
-- session.

-- ============================================================================
-- 1. EXTEND brand_applications
-- ============================================================================
alter table brand_applications
  add column if not exists applicant_user_id uuid references auth.users (id) on delete cascade,
  add column if not exists applicant_role text,
  add column if not exists brand_name_ar text,
  add column if not exists brand_name_en text,
  add column if not exists website_url text,
  add column if not exists other_social_urls text[] not null default '{}',
  add column if not exists additional_categories text[] not null default '{}',
  add column if not exists founding_year int,
  add column if not exists country text,
  add column if not exists city text,
  -- New structured multi-select, replacing free-text `sales_channels` for
  -- new submissions. `sales_channels` itself is left alone below except for
  -- becoming nullable — legacy rows keep their original free-text value,
  -- new rows populate sales_channels_list instead. Deliberately not unified
  -- into one column; same "document divergence, don't silently merge it"
  -- precedent already used elsewhere in this project.
  add column if not exists sales_channels_list text[] not null default '{}',
  add column if not exists approx_product_count int,
  add column if not exists approx_monthly_orders text,
  add column if not exists legal_status text,
  add column if not exists commercial_registration_number text,
  add column if not exists tax_registration_number text,
  add column if not exists legal_business_name text,
  add column if not exists product_price_range text,
  add column if not exists products_manufactured_by_brand boolean,
  add column if not exists made_to_order boolean,
  add column if not exists avg_preparation_time text,
  add column if not exists shipping_coverage text,
  add column if not exists return_exchange_available boolean,
  add column if not exists inventory_status text,
  add column if not exists consent_accurate boolean not null default false,
  add column if not exists consent_terms boolean not null default false,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users (id),
  add column if not exists rejection_reason text,
  add column if not exists admin_notes text,
  add column if not exists changes_requested_message text,
  -- brands' primary key is `slug text`, not a uuid — no separate id column.
  add column if not exists approved_brand_id text references brands (slug),
  add column if not exists reapplication_allowed_at timestamptz,
  add column if not exists reapplication_override boolean not null default false,
  add column if not exists converted_at timestamptz,
  add column if not exists converted_by uuid references auth.users (id),
  -- Immutable copy of the applicant's account name/email/phone/created_at at
  -- submission time — lets the admin see "what the account looked like when
  -- they applied" even if the profile changes later, without ever
  -- overwriting live profile data with application-entered data (the brief's
  -- explicit account-vs-application distinction).
  add column if not exists applicant_account_snapshot jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table brand_applications alter column sales_channels drop not null;

create index if not exists brand_applications_applicant_user_id_idx
  on brand_applications (applicant_user_id);
create index if not exists brand_applications_status_idx
  on brand_applications (status);

-- updated_at bump trigger — mirrors the pattern this migration file's
-- neighbors use for other tables' updated_at columns.
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

-- Expanded status lifecycle. Same "drop the auto-named check, recreate it"
-- approach already used for orders_status_check elsewhere in this project.
-- Backfill existing rows onto their nearest equivalent new status first, so
-- the new constraint never rejects a row that already exists.
update brand_applications set status = 'submitted' where status = 'new';
update brand_applications set status = 'under_review' where status = 'reviewing';
-- 'approved' and 'rejected' already match the new vocabulary as-is.

alter table brand_applications drop constraint if exists brand_applications_status_check;
alter table brand_applications add constraint brand_applications_status_check
  check (status in (
    'draft', 'submitted', 'under_review', 'changes_requested', 'resubmitted',
    'approved_pending_creation', 'approved', 'rejected', 'withdrawn', 'converted_to_brand'
  ));

alter table brand_applications drop constraint if exists brand_applications_legal_status_check;
alter table brand_applications add constraint brand_applications_legal_status_check
  check (legal_status is null or legal_status in (
    'both_docs', 'commercial_registration_only', 'tax_card_only',
    'documents_pending', 'unregistered_individual', 'other'
  ));

-- One active application per applicant — the real, race-condition-proof
-- limit (application code also pre-checks for a friendly error message, but
-- this index is the actual source of truth). A user with no account link
-- (legacy rows, applicant_user_id null) is never constrained by this index,
-- since a unique index ignores nulls.
create unique index if not exists brand_applications_one_active_per_user
  on brand_applications (applicant_user_id)
  where status in (
    'draft', 'submitted', 'under_review', 'changes_requested',
    'resubmitted', 'approved_pending_creation'
  );

-- ============================================================================
-- 2. NEW TABLES
-- ============================================================================
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
-- 3. RLS
-- No public policies on any of the three tables above, on purpose — every
-- read/write goes through supabaseAdmin from Next.js routes gated by
-- requireUser()/requireAdminUser(), exactly like brand_applications already
-- worked before this migration (and like orders/addresses/profiles
-- elsewhere in this schema). See the plan's "RLS / authorization decision"
-- section for the full reasoning — the main one being that per-column
-- write protection (applicant can edit their own draft but never set
-- `status`/`admin_notes`/`applicant_user_id` themselves) isn't expressible
-- in row-level RLS alone, so it's enforced in the API routes instead.
-- ============================================================================
alter table brand_application_documents enable row level security;
alter table brand_application_status_history enable row level security;

-- ============================================================================
-- 4. STORAGE — private documents bucket
-- This repo's one existing bucket (product-images) was created by hand in
-- the Supabase dashboard; there's no precedent here for bucket-creation SQL
-- actually taking effect. This insert is included for convenience but
-- MUST BE VERIFIED in Storage → Buckets after running this migration —
-- confirm `brand-application-documents` exists with Public OFF, and create
-- it by hand there if this insert didn't take.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('brand-application-documents', 'brand-application-documents', false)
on conflict (id) do nothing;

-- Applicants may only read/write objects under a path that starts with
-- their own user id — enforced by requiring the first path segment (the
-- storage path is always `${applicant_user_id}/${application_id}/...`,
-- assigned server-side, never client-supplied) to equal auth.uid().
drop policy if exists "Applicants can upload their own application documents"
  on storage.objects;
create policy "Applicants can upload their own application documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'brand-application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Applicants can read their own application documents"
  on storage.objects;
create policy "Applicants can read their own application documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'brand-application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins get read access to every application document — same
-- `profiles.is_admin` check used by every other admin-facing policy/route
-- in this project, never a client-supplied role.
drop policy if exists "Admins can read all application documents" on storage.objects;
create policy "Admins can read all application documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'brand-application-documents'
    and exists (
      select 1 from profiles where profiles.id = auth.uid() and profiles.is_admin
    )
  );

-- ============================================================================
-- 5. convert_application_to_brand — atomic approve-to-brand conversion
-- Mirrors place_order()'s pattern: security definer, pinned search_path,
-- revoked from anon/authenticated, granted to service_role only. Creates
-- the brand row and updates the source application in a single transaction,
-- and is idempotent — calling it again on an already-converted application
-- raises instead of creating a second brand.
-- ============================================================================
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

  insert into brands (
    slug, name, tagline, category, founded_year, city, hero_image,
    about_description, about_image, story_image, story_body,
    info_badges, category_tabs, active_tab, values, similar_brand_slugs
  )
  values (
    v_slug,
    p_brand->>'name',
    coalesce(p_brand->>'tagline', ''),
    coalesce(p_brand->>'category', ''),
    nullif(p_brand->>'foundedYear', '')::int,
    coalesce(p_brand->>'city', 'Cairo'),
    coalesce(p_brand->>'heroImage', ''),
    coalesce(p_brand->>'aboutDescription', ''),
    coalesce(p_brand->>'aboutImage', ''),
    coalesce(p_brand->>'storyImage', ''),
    coalesce(p_brand->>'storyBody', ''),
    coalesce(p_brand->'infoBadges', '[]'::jsonb),
    coalesce(p_brand->'categoryTabs', '[]'::jsonb),
    coalesce(p_brand->>'activeTab', 'shop-all'),
    coalesce(p_brand->'values', '[]'::jsonb),
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_brand->'similarBrandSlugs', '[]'::jsonb))),
      '{}'
    )
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
