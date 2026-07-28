-- Brand application rebuild: versioned application payloads, correction
-- requests, private onboarding defaults, and an idempotent conversion
-- contract. Existing columns remain the compatibility surface for legacy
-- applications and the current admin UI; no application data is deleted.

alter table public.brand_applications
  add column if not exists reference_number text,
  add column if not exists schema_version integer not null default 2,
  add column if not exists preferred_contact_method text,
  add column if not exists application_data jsonb not null default '{}'::jsonb,
  add column if not exists current_step integer not null default 1,
  add column if not exists last_saved_at timestamptz,
  add column if not exists lock_version bigint not null default 0,
  add column if not exists submitted_at timestamptz,
  add column if not exists requested_sections text[] not null default '{}',
  add column if not exists requested_fields text[] not null default '{}',
  add column if not exists applicant_visible_message text,
  add column if not exists information_response_deadline timestamptz,
  add column if not exists last_resubmitted_at timestamptz,
  add column if not exists converted_brand_id uuid;

alter table public.brand_applications
  drop constraint if exists brand_applications_preferred_contact_method_check;
alter table public.brand_applications
  add constraint brand_applications_preferred_contact_method_check
  check (
    preferred_contact_method is null
    or preferred_contact_method in ('email', 'phone', 'whatsapp')
  );

alter table public.brand_applications
  drop constraint if exists brand_applications_current_step_check;
alter table public.brand_applications
  add constraint brand_applications_current_step_check check (current_step between 1 and 5);

create sequence if not exists public.brand_application_reference_seq;

create or replace function public.next_brand_application_reference()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select 'MAH-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.brand_application_reference_seq')::text, 6, '0')
$$;

update public.brand_applications
set reference_number = public.next_brand_application_reference()
where reference_number is null;

alter table public.brand_applications
  alter column reference_number set default public.next_brand_application_reference(),
  alter column reference_number set not null;

create unique index if not exists brand_applications_reference_number_key
  on public.brand_applications(reference_number);
create index if not exists brand_applications_converted_brand_id_idx
  on public.brand_applications(converted_brand_id);

create table if not exists public.brand_application_revisions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.brand_applications(id) on delete restrict,
  revision_number integer not null,
  snapshot jsonb not null,
  event_type text not null
    check (event_type in ('submitted', 'information_requested', 'resubmitted', 'approved', 'rejected')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(application_id, revision_number)
);

create index if not exists brand_application_revisions_application_id_idx
  on public.brand_application_revisions(application_id, revision_number desc);

create table if not exists public.brand_application_information_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.brand_applications(id) on delete restrict,
  requested_sections text[] not null default '{}',
  requested_fields text[] not null default '{}',
  message text not null,
  response_deadline timestamptz,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  applicant_response text,
  responded_at timestamptz,
  resubmitted_at timestamptz,
  status text not null default 'open' check (status in ('open', 'responded', 'closed'))
);

create index if not exists brand_application_information_requests_application_id_idx
  on public.brand_application_information_requests(application_id, requested_at desc);

alter table public.brand_application_documents
  add column if not exists document_type text not null default 'other_supporting_document',
  add column if not exists upload_status text not null default 'uploaded',
  add column if not exists replaced_by uuid references public.brand_application_documents(id),
  add column if not exists removed_at timestamptz;

alter table public.brand_application_documents
  drop constraint if exists brand_application_documents_type_check;
alter table public.brand_application_documents
  add constraint brand_application_documents_type_check check (
    document_type in (
      'commercial_registration', 'tax_card', 'trademark_certificate',
      'authorized_representative', 'other_supporting_document'
    )
  );

alter table public.brand_application_documents
  drop constraint if exists brand_application_documents_upload_status_check;
alter table public.brand_application_documents
  add constraint brand_application_documents_upload_status_check
  check (upload_status in ('uploading', 'uploaded', 'failed', 'replaced', 'removed'));

alter table public.brand_application_revisions enable row level security;
alter table public.brand_application_information_requests enable row level security;

-- These tables are accessed only by authenticated, authorization-gated
-- Next.js routes. Explicit grants are required for new Supabase projects,
-- while RLS keeps direct Data API access closed (no public policies).
revoke all on public.brand_application_revisions from anon, authenticated;
revoke all on public.brand_application_information_requests from anon, authenticated;
grant all on public.brand_application_revisions to service_role;
grant all on public.brand_application_information_requests to service_role;
grant usage, select on sequence public.brand_application_reference_seq to service_role;

alter table public.brands
  add column if not exists source_application_id uuid,
  add column if not exists setup_status text not null default 'complete',
  add column if not exists onboarding_defaults jsonb not null default '{}'::jsonb;

alter table public.brands
  drop constraint if exists brands_setup_status_check;
alter table public.brands
  add constraint brands_setup_status_check
  check (setup_status in ('setup_required', 'in_progress', 'ready_for_review', 'complete'));

alter table public.brands
  drop constraint if exists brands_source_application_id_fkey;
alter table public.brands
  add constraint brands_source_application_id_fkey
  foreign key (source_application_id) references public.brand_applications(id) on delete restrict;

create unique index if not exists brands_source_application_id_key
  on public.brands(source_application_id)
  where source_application_id is not null;

alter table public.brand_applications
  drop constraint if exists brand_applications_converted_brand_id_fkey;
alter table public.brand_applications
  add constraint brand_applications_converted_brand_id_fkey
  foreign key (converted_brand_id) references public.brands(id) on delete restrict;

-- Atomic, idempotent application -> draft brand conversion. Public profile
-- fields are explicitly mapped; legal/review/contact data stays only on the
-- application. Operational answers move only into private onboarding_defaults.
create or replace function public.convert_application_to_brand(
  p_application_id uuid,
  p_admin_user_id uuid,
  p_brand jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_application public.brand_applications%rowtype;
  v_brand_id uuid;
  v_slug text;
  v_sku_prefix text;
  v_data jsonb;
begin
  select * into v_application
  from public.brand_applications
  where id = p_application_id
  for update;

  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;

  if v_application.converted_brand_id is not null or v_application.status = 'converted_to_brand' then
    select slug into v_slug from public.brands where id = v_application.converted_brand_id;
    if v_slug is null then
      select slug into v_slug from public.brands where source_application_id = p_application_id;
    end if;
    if v_slug is null then raise exception 'CONVERSION_LINK_BROKEN'; end if;
    return v_slug;
  end if;

  if v_application.status not in ('approved', 'approved_pending_creation') then
    raise exception 'NOT_APPROVED';
  end if;
  if v_application.applicant_user_id is null then
    raise exception 'APPLICATION_HAS_NO_OWNER';
  end if;

  v_slug := nullif(trim(p_brand->>'slug'), '');
  if v_slug is null then raise exception 'MISSING_SLUG'; end if;

  v_sku_prefix := upper(trim(coalesce(p_brand->>'skuPrefix', '')));
  if v_sku_prefix = '' then raise exception 'MISSING_SKU_PREFIX'; end if;
  if v_sku_prefix !~ '^[A-Z0-9]{2,6}$' then raise exception 'INVALID_SKU_PREFIX'; end if;

  v_data := coalesce(v_application.application_data, '{}'::jsonb);

  insert into public.brands (
    slug, name, tagline, category, founded_year, city, hero_image,
    logo_image, website_url, about_description, about_image,
    story_image, story_image_2, story_body, info_badges, category_tabs,
    active_tab, values, similar_brand_slugs, shop_the_look, sku_prefix,
    owner_user_id, source_application_id, setup_status, onboarding_defaults,
    is_active
  )
  values (
    v_slug,
    coalesce(nullif(v_data->>'brandName', ''), nullif(v_application.brand_name_en, ''), v_application.brand_name),
    coalesce(nullif(v_data->>'shortDescription', ''), p_brand->>'tagline', ''),
    coalesce(nullif(v_data->>'primaryCategory', ''), v_application.product_category, ''),
    coalesce(nullif(v_data->>'foundedYear', '')::int, v_application.founding_year),
    coalesce(nullif(v_data->>'city', ''), v_application.city, 'Cairo'),
    coalesce(p_brand->>'heroImage', ''),
    nullif(p_brand->>'logoImage', ''),
    coalesce(nullif(v_data#>>'{socialLinks,website,url}', ''), nullif(v_application.website_url, ''), nullif(p_brand->>'websiteUrl', '')),
    coalesce(nullif(v_data->>'shortDescription', ''), nullif(v_application.brand_story, ''), ''),
    coalesce(p_brand->>'aboutImage', ''),
    coalesce(p_brand->>'storyImage', ''),
    nullif(p_brand->>'storyImage2', ''),
    coalesce(nullif(v_data->>'fullBrandStory', ''), nullif(v_application.brand_story, ''), ''),
    coalesce(p_brand->'infoBadges', '[]'::jsonb),
    coalesce(p_brand->'categoryTabs', '[]'::jsonb),
    coalesce(p_brand->>'activeTab', 'shop-all'),
    coalesce(p_brand->'values', '[]'::jsonb),
    coalesce(
      (select array_agg(value::text) from jsonb_array_elements_text(coalesce(p_brand->'similarBrandSlugs', '[]'::jsonb))),
      '{}'
    ),
    coalesce(p_brand->'shopTheLook', '[]'::jsonb),
    v_sku_prefix,
    v_application.applicant_user_id,
    p_application_id,
    'setup_required',
    jsonb_strip_nulls(jsonb_build_object(
      'manufacturingModel', v_data->'manufacturingModel',
      'inventoryModels', v_data->'inventoryModels',
      'inventoryStorage', v_data->'inventoryStorage',
      'orderPreparation', v_data->'orderPreparation',
      'courierPickup', v_data->'courierPickup',
      'preparationTime', v_data->'preparationTime',
      'shippingCoverage', v_data->'shippingCoverage',
      'returnsAccepted', v_data->'returnsAccepted',
      'exchangesAccepted', v_data->'exchangesAccepted',
      'returnWindow', v_data->'returnWindow'
    )),
    false
  )
  returning id into v_brand_id;

  insert into public.brand_staff (brand_id, user_id)
  values (v_brand_id, v_application.applicant_user_id)
  on conflict (brand_id, user_id) do nothing;

  update public.brand_applications
  set status = 'converted_to_brand',
      approved_brand_id = v_slug,
      converted_brand_id = v_brand_id,
      converted_at = now(),
      converted_by = p_admin_user_id
  where id = p_application_id;

  insert into public.brand_application_status_history
    (application_id, from_status, to_status, changed_by, reason)
  values
    (p_application_id, v_application.status, 'converted_to_brand', p_admin_user_id, 'Draft brand created from approved application');

  insert into public.brand_application_revisions
    (application_id, revision_number, snapshot, event_type, created_by)
  select p_application_id,
         coalesce(max(revision_number), 0) + 1,
         jsonb_build_object(
           'applicationData', v_data,
           'convertedBrandId', v_brand_id,
           'convertedBrandSlug', v_slug
         ),
         'approved',
         p_admin_user_id
  from public.brand_application_revisions
  where application_id = p_application_id;

  insert into public.audit_logs
    (actor_id, actor_label, entity_type, entity_id, action, after_value)
  values
    (p_admin_user_id, 'Admin', 'application', p_application_id::text, 'convert_to_brand',
     jsonb_build_object('brandId', v_brand_id, 'brandSlug', v_slug));

  return v_slug;
end;
$$;

revoke all on function public.convert_application_to_brand(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.convert_application_to_brand(uuid, uuid, jsonb)
  to service_role;
