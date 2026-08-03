-- Cleans up brand-profile fields left over from a design this project no
-- longer uses. Confirmed via a full audit (plus a second pass that caught
-- 2 real usages the first one missed — see below) that none of the
-- dropped columns are rendered anywhere in the current design:
--   - website_url: editable in 2 places (the old brand-portal page-content
--     form and BrandForm) but displayed in 0 — the one component that
--     would show it, components/brand/BrandHero.tsx, isn't imported by
--     any page at all.
--   - values, similar_brand_slugs, shop_the_look, info_badges,
--     category_tabs, active_tab, story_image, story_image_2: their
--     rendering components (ValuesSection, SimilarBrands, ShopTheLook,
--     AboutBrand) are never imported anywhere, or (category_tabs/
--     active_tab) the one call site hardcodes them to [] / "shop-all"
--     regardless of what's stored.
-- tagline is deliberately NOT dropped, despite no longer being editable
-- from any form/inline-edit field — components/navigation/BrandsMegaMenu
-- .tsx and components/Sponsored.tsx both still read it live, as the
-- fallback description shown when a brand's about_description is empty.
-- story_body is also NOT touched — apps/mobile/app/brands/[slug].tsx
-- still renders it, so components/admin/BrandForm.tsx keeps that one
-- field as its sole remaining editor.
--
-- hero_image/about_image/about_description/tagline stay as real columns
-- (inline-edit and the fallback-description reads above still need them)
-- but the brand-creation form (BrandForm.tsx) no longer collects
-- hero_image/about_image/about_description at all now that
-- InlineEditableImage/RichTextEditableField are the real editors, and
-- never collected tagline either — so a brand can be created with these
-- blank and filled in immediately after. Defaulted to '' so insert
-- doesn't need to explicitly pass them.
alter table brands alter column hero_image set default '';
alter table brands alter column about_image set default '';
alter table brands alter column about_description set default '';
alter table brands alter column tagline set default '';

alter table brands drop column if exists website_url;
alter table brands drop column if exists values;
alter table brands drop column if exists similar_brand_slugs;
alter table brands drop column if exists shop_the_look;
alter table brands drop column if exists info_badges;
alter table brands drop column if exists category_tabs;
alter table brands drop column if exists active_tab;
alter table brands drop column if exists story_image;
alter table brands drop column if exists story_image_2;

-- convert_application_to_brand() wrote all of the dropped columns above —
-- same signature, rewritten to only insert what still exists. Every
-- fallback-from-application-data expression (about_description from
-- fullBrandStory/brand_story, etc.) is unchanged; only the dropped
-- columns' values are removed.
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
    logo_image, about_description, about_image, story_body, sku_prefix,
    owner_user_id, source_application_id, setup_status, onboarding_defaults,
    is_active
  )
  values (
    v_slug,
    coalesce(nullif(v_data->>'brandName', ''), nullif(v_application.brand_name_en, ''), v_application.brand_name),
    coalesce(nullif(v_data->>'shortDescription', ''), nullif(p_brand->>'tagline', ''), ''),
    coalesce(nullif(v_data->>'primaryCategory', ''), v_application.product_category, ''),
    coalesce(v_application.additional_categories, '{}'),
    coalesce(nullif(v_data->>'foundedYear', '')::int, v_application.founding_year),
    coalesce(nullif(v_data->>'city', ''), v_application.city, 'Cairo'),
    coalesce(p_brand->>'heroImage', ''),
    nullif(p_brand->>'logoImage', ''),
    coalesce(nullif(v_data->>'shortDescription', ''), nullif(v_application.brand_story, ''), ''),
    coalesce(p_brand->>'aboutImage', ''),
    coalesce(nullif(v_data->>'fullBrandStory', ''), nullif(v_application.brand_story, ''), ''),
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
