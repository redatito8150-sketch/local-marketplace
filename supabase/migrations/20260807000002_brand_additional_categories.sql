-- Brands only ever carried a single `category` string (e.g. "Women's
-- Fashion"), even though the brand application form has long collected
-- multiple categories (`brand_applications.additional_categories`, added in
-- 20260725000001) — that data was silently dropped at conversion time
-- (convert_application_to_brand only ever wrote the primary category).
-- This adds the missing column on brands and carries the application's
-- additional_categories through on conversion, so a brand created from an
-- application with "Women's Fashion, Home & Living, Fashion" actually keeps
-- all three instead of just the first.
alter table brands add column if not exists additional_categories text[] not null default '{}';

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
    slug, name, tagline, category, additional_categories, founded_year, city, hero_image,
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
    coalesce(v_application.additional_categories, '{}'),
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

  update public.profiles
  set role = 'brand_owner'
  where id = v_application.applicant_user_id;

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
