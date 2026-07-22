-- Draft-safe Page Studio section lifecycle. Sections are soft-deleted in the
-- draft and only disappear from the storefront after an explicit publish.
alter table public.page_sections
  add column if not exists draft_deleted boolean not null default false,
  add column if not exists published_deleted boolean not null default false;

create or replace function public.create_page_section_draft(
  p_page_key text,
  p_section_type text,
  p_config jsonb,
  p_actor_id uuid,
  p_actor_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
  v_draft_position integer;
  v_published_position integer;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));
  if p_page_key !~ '^[a-z][a-z0-9-]{0,39}$' then raise exception 'Invalid page key'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'Section configuration must be an object'; end if;

  select coalesce(max(draft_position), 0) + 10,
         coalesce(max(published_position), 0) + 10
    into v_draft_position, v_published_position
  from public.page_sections where page_key = p_page_key;

  insert into public.page_sections (
    id, page_key, section_key, section_type, draft_position, published_position,
    is_required, draft_config, published_config, draft_visible, published_visible,
    draft_deleted, published_deleted, created_by, updated_by
  ) values (
    v_id, p_page_key, p_section_type || '_' || replace(v_id::text, '-', ''), p_section_type,
    v_draft_position, v_published_position, false, p_config, p_config, true, false,
    false, true, p_actor_id, p_actor_id
  );

  insert into public.audit_logs (actor_id, actor_label, entity_type, entity_id, action, after_value)
  values (p_actor_id, p_actor_label, 'page', p_page_key, 'create',
    jsonb_build_object('sectionId', v_id, 'sectionType', p_section_type));
  return v_id;
end;
$$;

create or replace function public.duplicate_page_section_draft(
  p_section_id uuid,
  p_actor_id uuid,
  p_actor_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source public.page_sections%rowtype;
  v_id uuid := gen_random_uuid();
  v_draft_position integer;
  v_published_position integer;
begin
  select * into v_source from public.page_sections where id = p_section_id and not draft_deleted;
  if v_source.id is null then raise exception 'Page section not found'; end if;
  perform pg_advisory_xact_lock(hashtext('page-studio:' || v_source.page_key));
  select * into v_source from public.page_sections where id = p_section_id and not draft_deleted for update;
  if v_source.id is null then raise exception 'Page section not found'; end if;

  select coalesce(max(draft_position), 0) + 10,
         coalesce(max(published_position), 0) + 10
    into v_draft_position, v_published_position
  from public.page_sections where page_key = v_source.page_key;

  insert into public.page_sections (
    id, page_key, section_key, section_type, draft_position, published_position,
    is_required, draft_config, published_config, draft_visible, published_visible,
    draft_deleted, published_deleted, created_by, updated_by
  ) values (
    v_id, v_source.page_key, v_source.section_type || '_' || replace(v_id::text, '-', ''),
    v_source.section_type, v_draft_position, v_published_position, false,
    v_source.draft_config, v_source.draft_config, v_source.draft_visible, false,
    false, true, p_actor_id, p_actor_id
  );

  insert into public.audit_logs (actor_id, actor_label, entity_type, entity_id, action, after_value)
  values (p_actor_id, p_actor_label, 'page', v_source.page_key, 'create',
    jsonb_build_object('sectionId', v_id, 'duplicatedFrom', p_section_id));
  return v_id;
end;
$$;

create or replace function public.delete_page_section_draft(
  p_section_id uuid,
  p_actor_id uuid,
  p_actor_label text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_section public.page_sections%rowtype;
  v_position integer;
begin
  select * into v_section from public.page_sections where id = p_section_id and not draft_deleted;
  if v_section.id is null then raise exception 'Page section not found'; end if;
  if v_section.is_required then raise exception 'Required sections cannot be removed'; end if;
  perform pg_advisory_xact_lock(hashtext('page-studio:' || v_section.page_key));
  select * into v_section from public.page_sections where id = p_section_id and not draft_deleted for update;
  if v_section.id is null then raise exception 'Page section not found'; end if;
  if v_section.is_required then raise exception 'Required sections cannot be removed'; end if;
  select coalesce(max(draft_position), 0) + 10 into v_position
  from public.page_sections where page_key = v_section.page_key;

  update public.page_sections
  set draft_deleted = true, draft_visible = false, draft_position = v_position,
      updated_by = p_actor_id, updated_at = now()
  where id = p_section_id;

  insert into public.audit_logs (actor_id, actor_label, entity_type, entity_id, action, before_value)
  values (p_actor_id, p_actor_label, 'page', v_section.page_key, 'delete',
    jsonb_build_object('sectionId', p_section_id, 'sectionKey', v_section.section_key));
  return v_section.page_key;
end;
$$;

create or replace function public.publish_page_draft(
  p_page_key text, p_actor_id uuid, p_actor_label text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_version integer; v_before jsonb; v_after jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));
  if not exists (select 1 from public.page_sections where page_key = p_page_key and not draft_deleted) then raise exception 'Page not found'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.page_versions where page_key = p_page_key;
  select jsonb_agg(jsonb_build_object('sectionKey', section_key, 'sectionType', section_type,
    'position', published_position, 'visible', published_visible, 'deleted', published_deleted,
    'config', published_config) order by published_position) into v_before
  from public.page_sections where page_key = p_page_key;

  update public.page_sections
  set published_config = draft_config, published_visible = draft_visible,
      published_position = draft_position, published_deleted = draft_deleted,
      published_by = p_actor_id, published_at = now(), updated_at = now()
  where page_key = p_page_key;

  select jsonb_agg(jsonb_build_object('sectionKey', section_key, 'sectionType', section_type,
    'position', published_position, 'visible', published_visible, 'deleted', published_deleted,
    'config', published_config) order by published_position) into v_after
  from public.page_sections where page_key = p_page_key;
  insert into public.page_versions (page_key, version, snapshot, created_by)
  values (p_page_key, v_version, v_after, p_actor_id);
  insert into public.audit_logs (actor_id, actor_label, entity_type, entity_id, action, before_value, after_value)
  values (p_actor_id, p_actor_label, 'page', p_page_key, 'publish', v_before,
    jsonb_build_object('version', v_version, 'sections', v_after));
  return v_version;
end;
$$;

create or replace function public.reorder_page_draft(
  p_page_key text, p_section_ids uuid[], p_actor_id uuid, p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_page_count integer; v_distinct_count integer; v_before jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));
  select count(*) into v_page_count from public.page_sections where page_key = p_page_key and not draft_deleted;
  select count(distinct id) into v_distinct_count from unnest(p_section_ids) as ids(id);
  if v_page_count = 0 then raise exception 'Page not found'; end if;
  if coalesce(array_length(p_section_ids, 1), 0) <> v_page_count or v_distinct_count <> v_page_count
    or exists (select 1 from unnest(p_section_ids) as ids(id) where not exists (
      select 1 from public.page_sections section where section.id = ids.id
        and section.page_key = p_page_key and not section.draft_deleted
    )) then raise exception 'Section order must contain every active page section exactly once'; end if;

  select jsonb_agg(jsonb_build_object('id', id, 'position', draft_position) order by draft_position)
    into v_before from public.page_sections where page_key = p_page_key;
  update public.page_sections set draft_position = draft_position + 1000000 where page_key = p_page_key;
  update public.page_sections section set draft_position = ordered.ordinality * 10,
    updated_by = p_actor_id, updated_at = now()
  from unnest(p_section_ids) with ordinality as ordered(id, ordinality)
  where section.id = ordered.id and section.page_key = p_page_key and not section.draft_deleted;
  with removed as (
    select id, row_number() over (order by created_at, id) as row_number
    from public.page_sections where page_key = p_page_key and draft_deleted
  )
  update public.page_sections section
  set draft_position = (v_page_count + removed.row_number) * 10
  from removed where section.id = removed.id;
  insert into public.audit_logs (actor_id, actor_label, entity_type, entity_id, action, before_value, after_value)
  values (p_actor_id, p_actor_label, 'page', p_page_key, 'reorder', v_before, to_jsonb(p_section_ids));
end;
$$;

create or replace function public.discard_page_draft(
  p_page_key text, p_actor_id uuid, p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_before jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));
  if not exists (select 1 from public.page_sections where page_key = p_page_key) then raise exception 'Page not found'; end if;
  select jsonb_agg(jsonb_build_object('sectionKey', section_key, 'position', draft_position,
    'visible', draft_visible, 'deleted', draft_deleted, 'config', draft_config) order by draft_position)
    into v_before from public.page_sections where page_key = p_page_key;
  update public.page_sections set draft_config = published_config, draft_visible = published_visible,
    draft_position = published_position, draft_deleted = published_deleted,
    updated_by = p_actor_id, updated_at = now() where page_key = p_page_key;
  insert into public.audit_logs (actor_id, actor_label, entity_type, entity_id, action, before_value, after_value)
  values (p_actor_id, p_actor_label, 'page', p_page_key, 'discard_draft', v_before, null);
end;
$$;

create or replace function public.restore_page_version_to_draft(
  p_page_key text, p_version integer, p_actor_id uuid, p_actor_label text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_snapshot jsonb; v_before jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('page-studio:' || p_page_key));
  select snapshot into v_snapshot from public.page_versions
  where page_key = p_page_key and version = p_version;
  if v_snapshot is null then raise exception 'Page version not found'; end if;
  select jsonb_agg(jsonb_build_object('sectionKey', section_key, 'position', draft_position,
    'visible', draft_visible, 'deleted', draft_deleted, 'config', draft_config) order by draft_position)
    into v_before from public.page_sections where page_key = p_page_key;

  update public.page_sections set draft_position = draft_position + 1000000 where page_key = p_page_key;
  update public.page_sections section
  set draft_config = item.config, draft_visible = item.visible,
      draft_deleted = coalesce(item.deleted, false), draft_position = item.position,
      updated_by = p_actor_id, updated_at = now()
  from jsonb_to_recordset(v_snapshot) as item(
    "sectionKey" text, "sectionType" text, position integer,
    visible boolean, deleted boolean, config jsonb
  )
  where section.page_key = p_page_key and section.section_key = item."sectionKey";

  with snapshot_max as (
    select coalesce(max(item.position), 0) as max_position
    from jsonb_to_recordset(v_snapshot) as item(position integer)
  ), absent as (
    select section.id, row_number() over (order by section.created_at, section.id) as row_number
    from public.page_sections section
    where section.page_key = p_page_key and not exists (
      select 1 from jsonb_to_recordset(v_snapshot) as item("sectionKey" text)
      where item."sectionKey" = section.section_key
    )
  )
  update public.page_sections section
  set draft_visible = section.is_required, draft_deleted = not section.is_required,
      draft_position = snapshot_max.max_position + (absent.row_number * 10),
      updated_by = p_actor_id, updated_at = now()
  from absent, snapshot_max where section.id = absent.id;

  insert into public.audit_logs (actor_id, actor_label, entity_type, entity_id, action, before_value, after_value)
  values (p_actor_id, p_actor_label, 'page', p_page_key, 'restore', v_before,
    jsonb_build_object('restoredVersion', p_version));
end;
$$;

revoke all on function public.create_page_section_draft(text, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.duplicate_page_section_draft(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.delete_page_section_draft(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_page_section_draft(text, text, jsonb, uuid, text) to service_role;
grant execute on function public.duplicate_page_section_draft(uuid, uuid, text) to service_role;
grant execute on function public.delete_page_section_draft(uuid, uuid, text) to service_role;
