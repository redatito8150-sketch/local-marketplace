-- convert_application_to_brand previously created a brand with no
-- sku_prefix set, leaving it unable to create any product until an admin
-- remembered to edit it afterwards (exactly how 'mahaly' ended up with 0
-- products). This rewrite requires a valid sku_prefix in the same payload
-- as the rest of the brand fields, so a brand can never be created
-- incomplete via this path.
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
  v_sku_prefix text;
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

  v_sku_prefix := upper(trim(coalesce(p_brand->>'skuPrefix', '')));
  if v_sku_prefix = '' then
    raise exception 'MISSING_SKU_PREFIX';
  end if;
  if v_sku_prefix !~ '^[A-Z0-9]{2,6}$' then
    raise exception 'INVALID_SKU_PREFIX';
  end if;

  -- Column set mirrors POST /api/admin/brands' plain insert exactly (see
  -- 20260721_collection_brand_content.sql for logo_image/website_url/
  -- story_image_2/shop_the_look) so a converted brand never lacks a field
  -- the normal create form would have set. id/is_active take their column
  -- defaults (gen_random_uuid() / true).
  insert into brands (
    slug, name, tagline, category, founded_year, city, hero_image,
    logo_image, website_url, about_description, about_image,
    story_image, story_image_2, story_body,
    info_badges, category_tabs, active_tab, values, similar_brand_slugs,
    shop_the_look, sku_prefix
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
    coalesce(p_brand->'shopTheLook', '[]'::jsonb),
    v_sku_prefix
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
