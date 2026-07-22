-- Page Studio foundation: drafts are private, publishing is explicit, and
-- every release is restorable. No arbitrary code or component names are stored.
create table if not exists public.page_sections (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  section_key text not null,
  section_type text not null check (section_type in (
    'hero', 'category_cards', 'benefits_strip', 'product_carousel',
    'product_grid', 'mood_tiles', 'featured_brand', 'brand_carousel',
    'promotional_banner', 'editorial_image', 'text_block', 'newsletter',
    'sponsored_brands', 'custom_product_collection', 'all_products_preview'
  )),
  draft_position integer not null check (draft_position >= 0),
  published_position integer not null check (published_position >= 0),
  is_required boolean not null default false,
  draft_config jsonb not null default '{}'::jsonb,
  published_config jsonb not null default '{}'::jsonb,
  draft_visible boolean not null default true,
  published_visible boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_key, section_key),
  unique (page_key, draft_position) deferrable initially deferred,
  unique (page_key, published_position) deferrable initially deferred
);

create index if not exists page_sections_page_draft_position_idx
  on public.page_sections (page_key, draft_position);
create index if not exists page_sections_page_published_position_idx
  on public.page_sections (page_key, published_position);

create table if not exists public.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (page_key, version)
);

create index if not exists page_versions_page_created_idx
  on public.page_versions (page_key, created_at desc);

alter table public.page_sections enable row level security;
alter table public.page_versions enable row level security;
-- Deliberately no browser policies. Storefront reads use the server-only
-- data layer so draft_config and version history can never leak to anon.

-- Existing installations may already have the first Page Studio prototype.
-- Move its homepage positions out of the target range before the idempotent
-- seed so the new All Products section cannot collide with an old slot.
update public.page_sections
set draft_position = draft_position + 100000,
    published_position = published_position + 100000
where page_key = 'home';

insert into public.page_sections (
  page_key, section_key, section_type, draft_position, published_position, is_required,
  draft_config, published_config, draft_visible, published_visible
)
values
  ('home', 'home_hero', 'hero', 10, 10, true,
    coalesce((select value from public.site_content where key = 'home_hero'), '{"headingLines":["Local brands.","Real stories.","All in one place."],"subheading":"Discover and shop from the best local brands. Support creators. Wear what matters.","ctaLabel":"Join As Brand","ctaHref":"/join-as-a-brand"}'::jsonb),
    coalesce((select value from public.site_content where key = 'home_hero'), '{"headingLines":["Local brands.","Real stories.","All in one place."],"subheading":"Discover and shop from the best local brands. Support creators. Wear what matters.","ctaLabel":"Join As Brand","ctaHref":"/join-as-a-brand"}'::jsonb), true, true),
  ('home', 'home_hero_tiles', 'category_cards', 20, 20, true,
    coalesce((select value from public.site_content where key = 'home_hero_tiles'), '{"women":{"label":"Women","href":"/shop/women","image":"/images/home/women-category-v2.png"},"men":{"label":"Men","href":"/shop/men","image":"/images/home/men-category-v2.png"},"kids":{"label":"Kids","href":"/shop/kids","image":"/images/home/kids-category-v2.png"},"home":{"label":"Home","href":"/shop/home","image":"https://images.unsplash.com/photo-1618220179428-22790b461013?w=800&q=80"}}'::jsonb),
    coalesce((select value from public.site_content where key = 'home_hero_tiles'), '{"women":{"label":"Women","href":"/shop/women","image":"/images/home/women-category-v2.png"},"men":{"label":"Men","href":"/shop/men","image":"/images/home/men-category-v2.png"},"kids":{"label":"Kids","href":"/shop/kids","image":"/images/home/kids-category-v2.png"},"home":{"label":"Home","href":"/shop/home","image":"https://images.unsplash.com/photo-1618220179428-22790b461013?w=800&q=80"}}'::jsonb), true, true),
  ('home', 'home_benefits', 'benefits_strip', 30, 30, true,
    '{"items":[{"title":"Curated with purpose","detail":"Handpicked local brands"},{"title":"Secure payments","detail":"Safe & trusted checkout"},{"title":"Fast delivery","detail":"Across Egypt"},{"title":"Easy returns","detail":"14 days to return"},{"title":"Support local","detail":"Empowering creators"}]}'::jsonb,
    '{"items":[{"title":"Curated with purpose","detail":"Handpicked local brands"},{"title":"Secure payments","detail":"Safe & trusted checkout"},{"title":"Fast delivery","detail":"Across Egypt"},{"title":"Easy returns","detail":"14 days to return"},{"title":"Support local","detail":"Empowering creators"}]}'::jsonb, true, true),
  ('home', 'home_new_arrivals', 'product_carousel', 40, 40, false,
    coalesce((select value from public.site_content where key = 'home_new_arrivals'), '{"title":"New Arrivals","source":"new","limit":12,"displayStyle":"carousel"}'::jsonb),
    coalesce((select value from public.site_content where key = 'home_new_arrivals'), '{"title":"New Arrivals","source":"new","limit":12,"displayStyle":"carousel"}'::jsonb), true, true),
  ('home', 'home_all_products', 'all_products_preview', 50, 50, false,
    '{"title":"Explore All Products","itemCount":10,"sorting":"newest","featuredOnly":false,"displayStyle":"carousel"}'::jsonb,
    '{"title":"Explore All Products","itemCount":10,"sorting":"newest","featuredOnly":false,"displayStyle":"carousel"}'::jsonb, true, true),
  ('home', 'shop_by_mood', 'mood_tiles', 60, 60, false,
    coalesce((select value from public.site_content where key = 'shop_by_mood'), '[{"id":"cairo-summer","label":"Cairo Summer","image":"https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&q=80","href":"/shop/women"},{"id":"weekend-escape","label":"Weekend Escape","image":"https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=600&q=80","href":"/shop/women"},{"id":"everyday-linen","label":"Everyday Linen","image":"https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=600&q=80","href":"/shop/women"},{"id":"after-dark","label":"After Dark","image":"https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&q=80","href":"/shop/women"},{"id":"made-for-movement","label":"Made for Movement","image":"https://images.unsplash.com/photo-1483721310020-03333e577078?w=600&q=80","href":"/shop/men"}]'::jsonb),
    coalesce((select value from public.site_content where key = 'shop_by_mood'), '[{"id":"cairo-summer","label":"Cairo Summer","image":"https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&q=80","href":"/shop/women"},{"id":"weekend-escape","label":"Weekend Escape","image":"https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=600&q=80","href":"/shop/women"},{"id":"everyday-linen","label":"Everyday Linen","image":"https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=600&q=80","href":"/shop/women"},{"id":"after-dark","label":"After Dark","image":"https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&q=80","href":"/shop/women"},{"id":"made-for-movement","label":"Made for Movement","image":"https://images.unsplash.com/photo-1483721310020-03333e577078?w=600&q=80","href":"/shop/men"}]'::jsonb), true, true),
  ('home', 'featured_brand_and_sponsored', 'featured_brand', 70, 70, false,
    coalesce((select value from public.site_content where key = 'featured_brand_and_sponsored'), '{"featuredBrandSlug":"studio-nile","sponsoredBrandSlugs":["nola","kai","sahara-form","remady-star"]}'::jsonb),
    coalesce((select value from public.site_content where key = 'featured_brand_and_sponsored'), '{"featuredBrandSlug":"studio-nile","sponsoredBrandSlugs":["nola","kai","sahara-form","remady-star"]}'::jsonb), true, true)
on conflict (page_key, section_key) do nothing;

update public.page_sections
set draft_position = case section_key
      when 'home_hero' then 10 when 'home_hero_tiles' then 20
      when 'home_benefits' then 30 when 'home_new_arrivals' then 40
      when 'home_all_products' then 50 when 'shop_by_mood' then 60
      when 'featured_brand_and_sponsored' then 70 else draft_position end,
    published_position = case section_key
      when 'home_hero' then 10 when 'home_hero_tiles' then 20
      when 'home_benefits' then 30 when 'home_new_arrivals' then 40
      when 'home_all_products' then 50 when 'shop_by_mood' then 60
      when 'featured_brand_and_sponsored' then 70 else published_position end
where page_key = 'home'
  and section_key in (
    'home_hero', 'home_hero_tiles', 'home_benefits', 'home_new_arrivals',
    'home_all_products', 'shop_by_mood', 'featured_brand_and_sponsored'
  );

update public.page_sections
set draft_config = case
      when jsonb_typeof(draft_config->'items') = 'array'
        and jsonb_array_length(draft_config->'items') > 0 then draft_config
      else '{"items":[{"title":"Curated with purpose","detail":"Handpicked local brands"},{"title":"Secure payments","detail":"Safe & trusted checkout"},{"title":"Fast delivery","detail":"Across Egypt"},{"title":"Easy returns","detail":"14 days to return"},{"title":"Support local","detail":"Empowering creators"}]}'::jsonb end,
    published_config = case
      when jsonb_typeof(published_config->'items') = 'array'
        and jsonb_array_length(published_config->'items') > 0 then published_config
      else '{"items":[{"title":"Curated with purpose","detail":"Handpicked local brands"},{"title":"Secure payments","detail":"Safe & trusted checkout"},{"title":"Fast delivery","detail":"Across Egypt"},{"title":"Easy returns","detail":"14 days to return"},{"title":"Support local","detail":"Empowering creators"}]}'::jsonb end
where page_key = 'home' and section_key = 'home_benefits';

create or replace function public.publish_page_draft(
  p_page_key text,
  p_actor_id uuid,
  p_actor_label text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version integer;
  v_before jsonb;
  v_after jsonb;
begin
  -- Serialize releases for the same page so max(version) + 1 remains unique.
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));

  if not exists (select 1 from public.page_sections where page_key = p_page_key) then
    raise exception 'Page not found';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.page_versions where page_key = p_page_key;

  select jsonb_agg(jsonb_build_object(
    'sectionKey', section_key, 'sectionType', section_type, 'position', published_position,
    'visible', published_visible, 'config', published_config
  ) order by published_position) into v_before
  from public.page_sections where page_key = p_page_key;

  update public.page_sections
  set published_config = draft_config,
      published_visible = draft_visible,
      published_position = draft_position,
      published_by = p_actor_id,
      published_at = now(),
      updated_at = now()
  where page_key = p_page_key;

  select jsonb_agg(jsonb_build_object(
    'sectionKey', section_key, 'sectionType', section_type, 'position', published_position,
    'visible', published_visible, 'config', published_config
  ) order by published_position) into v_after
  from public.page_sections where page_key = p_page_key;

  insert into public.page_versions (page_key, version, snapshot, created_by)
  values (p_page_key, v_version, v_after, p_actor_id);

  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_id, p_actor_label, 'page', p_page_key, 'publish', v_before,
    jsonb_build_object('version', v_version, 'sections', v_after)
  );

  return v_version;
end;
$$;

create or replace function public.restore_page_version_to_draft(
  p_page_key text,
  p_version integer,
  p_actor_id uuid,
  p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot jsonb;
  v_before jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));

  select snapshot into v_snapshot from public.page_versions
  where page_key = p_page_key and version = p_version;
  if v_snapshot is null then raise exception 'Page version not found'; end if;

  select jsonb_agg(jsonb_build_object(
    'sectionKey', section_key, 'position', draft_position,
    'visible', draft_visible, 'config', draft_config
  ) order by draft_position) into v_before
  from public.page_sections where page_key = p_page_key;

  -- Move every draft position out of the published range first. This keeps
  -- restoring an older order safe even when newer sections occupy an old slot.
  update public.page_sections
  set draft_position = draft_position + 1000000
  where page_key = p_page_key;

  update public.page_sections section
  set draft_config = item.config,
      draft_visible = item.visible,
      draft_position = item.position,
      updated_by = p_actor_id,
      updated_at = now()
  from jsonb_to_recordset(v_snapshot) as item(
    "sectionKey" text, "sectionType" text, position integer,
    visible boolean, config jsonb
  )
  where section.page_key = p_page_key and section.section_key = item."sectionKey";

  with snapshot_max as (
    select coalesce(max(item.position), 0) as max_position
    from jsonb_to_recordset(v_snapshot) as item(position integer)
  ), absent as (
    select section.id,
      row_number() over (order by section.created_at, section.id) as row_number
    from public.page_sections section
    where section.page_key = p_page_key
      and not exists (
        select 1 from jsonb_to_recordset(v_snapshot) as item("sectionKey" text)
        where item."sectionKey" = section.section_key
      )
  )
  update public.page_sections section
  set draft_visible = section.is_required,
      draft_position = snapshot_max.max_position + (absent.row_number * 10),
      updated_by = p_actor_id,
      updated_at = now()
  from absent, snapshot_max
  where section.page_key = p_page_key
    and section.id = absent.id;

  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_id, p_actor_label, 'page', p_page_key, 'restore', v_before,
    jsonb_build_object('restoredVersion', p_version)
  );
end;
$$;

create or replace function public.save_page_section_draft(
  p_section_id uuid,
  p_config jsonb,
  p_visible boolean,
  p_actor_id uuid,
  p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_page_key text;
begin
  select page_key, jsonb_build_object('config', draft_config, 'visible', draft_visible)
  into v_page_key, v_before
  from public.page_sections
  where id = p_section_id
  for update;

  if v_page_key is null then raise exception 'Page section not found'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Section configuration must be an object';
  end if;

  update public.page_sections
  set draft_config = p_config,
      draft_visible = case when is_required then true else p_visible end,
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_section_id;

  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  )
  select p_actor_id, p_actor_label, 'page', v_page_key, 'save_draft', v_before,
    jsonb_build_object(
      'sectionId', id, 'sectionKey', section_key,
      'config', draft_config, 'visible', draft_visible
    )
  from public.page_sections where id = p_section_id;
end;
$$;

create or replace function public.reorder_page_draft(
  p_page_key text,
  p_section_ids uuid[],
  p_actor_id uuid,
  p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_page_count integer;
  v_distinct_count integer;
  v_before jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));

  select count(*) into v_page_count from public.page_sections where page_key = p_page_key;
  select count(distinct id) into v_distinct_count from unnest(p_section_ids) as ids(id);
  if v_page_count = 0 then raise exception 'Page not found'; end if;
  if coalesce(array_length(p_section_ids, 1), 0) <> v_page_count
    or v_distinct_count <> v_page_count
    or exists (
      select 1 from unnest(p_section_ids) as ids(id)
      where not exists (
        select 1 from public.page_sections section
        where section.id = ids.id and section.page_key = p_page_key
      )
    ) then
    raise exception 'Section order must contain every page section exactly once';
  end if;

  select jsonb_agg(jsonb_build_object('id', id, 'position', draft_position) order by draft_position)
  into v_before from public.page_sections where page_key = p_page_key;

  update public.page_sections
  set draft_position = draft_position + 1000000
  where page_key = p_page_key;

  update public.page_sections section
  set draft_position = ordered.ordinality * 10,
      updated_by = p_actor_id,
      updated_at = now()
  from unnest(p_section_ids) with ordinality as ordered(id, ordinality)
  where section.id = ordered.id and section.page_key = p_page_key;

  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_id, p_actor_label, 'page', p_page_key, 'reorder', v_before,
    to_jsonb(p_section_ids)
  );
end;
$$;

create or replace function public.discard_page_draft(
  p_page_key text,
  p_actor_id uuid,
  p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));
  if not exists (select 1 from public.page_sections where page_key = p_page_key) then
    raise exception 'Page not found';
  end if;

  select jsonb_agg(jsonb_build_object(
    'sectionKey', section_key, 'position', draft_position,
    'visible', draft_visible, 'config', draft_config
  ) order by draft_position) into v_before
  from public.page_sections where page_key = p_page_key;

  update public.page_sections
  set draft_config = published_config,
      draft_visible = published_visible,
      draft_position = published_position,
      updated_by = p_actor_id,
      updated_at = now()
  where page_key = p_page_key;

  insert into public.audit_logs (
    actor_id, actor_label, entity_type, entity_id, action, before_value, after_value
  ) values (
    p_actor_id, p_actor_label, 'page', p_page_key, 'discard_draft', v_before, null
  );
end;
$$;

revoke all on function public.publish_page_draft(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.restore_page_version_to_draft(text, integer, uuid, text)
  from public, anon, authenticated;
revoke all on function public.save_page_section_draft(uuid, jsonb, boolean, uuid, text)
  from public, anon, authenticated;
revoke all on function public.reorder_page_draft(text, uuid[], uuid, text)
  from public, anon, authenticated;
revoke all on function public.discard_page_draft(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.publish_page_draft(text, uuid, text) to service_role;
grant execute on function public.restore_page_version_to_draft(text, integer, uuid, text) to service_role;
grant execute on function public.save_page_section_draft(uuid, jsonb, boolean, uuid, text) to service_role;
grant execute on function public.reorder_page_draft(text, uuid[], uuid, text) to service_role;
grant execute on function public.discard_page_draft(text, uuid, text) to service_role;
