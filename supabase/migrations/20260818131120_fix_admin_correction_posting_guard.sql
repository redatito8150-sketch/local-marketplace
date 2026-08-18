-- Full Admin warehouse corrections temporarily clear requested_by while the
-- canonical posting function runs. The immutable-history trigger must allow
-- only that tightly-scoped transition; every other historical field remains
-- immutable.

create or replace function private.guard_warehouse_correction_state_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and pg_catalog.to_jsonb(new)
      - 'status' - 'approved_by' - 'approved_at' - 'posted_at'
      - 'rejected_by' - 'rejected_at' - 'rejection_note'
      = pg_catalog.to_jsonb(old)
      - 'status' - 'approved_by' - 'approved_at' - 'posted_at'
      - 'rejected_by' - 'rejected_at' - 'rejection_note'
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and pg_catalog.current_setting('app.warehouse_admin_auto_post_in_progress', true) = 'on'
    and new.status = old.status
    and pg_catalog.to_jsonb(new)
      - 'requested_by' - 'approval_mode'
      = pg_catalog.to_jsonb(old)
      - 'requested_by' - 'approval_mode'
    and (
      (
        old.status = 'pending_approval'
        and old.approval_mode = 'independent'
        and old.requested_by is not null
        and old.approved_by is null
        and new.requested_by is null
        and new.approval_mode = 'admin_auto'
      )
      or
      (
        old.status = 'posted'
        and old.approval_mode = 'admin_auto'
        and old.requested_by is null
        and new.requested_by is not null
        and new.requested_by = new.approved_by
        and new.approval_mode = 'admin_auto'
      )
    )
  then
    return new;
  end if;

  raise exception 'WAREHOUSE_POSTED_HISTORY_IS_IMMUTABLE';
end;
$$;

create or replace function public.request_and_post_warehouse_admin_correction(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_correction_type text,
  p_reason_code text,
  p_note text,
  p_lines jsonb,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request jsonb;
  v_result jsonb;
  v_correction_id uuid;
  v_correction public.warehouse_corrections%rowtype;
  v_brand_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.is_admin is true
      and p.role::text = 'admin'
  ) then
    raise exception 'FULL_ADMIN_REQUIRED';
  end if;

  v_request := public.request_warehouse_correction_v2(
    p_transfer_id,
    p_actor_id,
    p_correction_type,
    p_reason_code,
    p_note,
    p_lines,
    p_operation_key
  );
  v_correction_id := (v_request ->> 'correctionId')::uuid;

  select wt.brand_id into v_brand_id
  from public.warehouse_transfers wt
  where wt.id = p_transfer_id;
  if v_brand_id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;

  perform 1 from public.brands b where b.id = v_brand_id for update;
  perform 1 from public.warehouse_transfers wt where wt.id = p_transfer_id for update;
  select * into v_correction
  from public.warehouse_corrections wc
  where wc.id = v_correction_id
  for update;

  if v_correction.status = 'posted' then
    return v_request || jsonb_build_object('approvalMode', v_correction.approval_mode, 'replayed', true);
  end if;
  if v_correction.status <> 'pending_approval' then raise exception 'CORRECTION_NOT_PENDING'; end if;
  if v_correction.requested_by is distinct from p_actor_id then raise exception 'IDEMPOTENCY_ACTOR_CONFLICT'; end if;

  perform pg_catalog.set_config('app.warehouse_admin_auto_post_in_progress', 'on', true);

  update public.warehouse_corrections
  set requested_by = null,
      approval_mode = 'admin_auto'
  where id = v_correction_id;

  v_result := public.approve_warehouse_correction_v2(v_correction_id, p_actor_id);

  update public.warehouse_corrections
  set requested_by = p_actor_id,
      approval_mode = 'admin_auto'
  where id = v_correction_id;

  perform pg_catalog.set_config('app.warehouse_admin_auto_post_in_progress', 'off', true);

  return v_result || jsonb_build_object('approvalMode', 'admin_auto', 'status', 'posted');
end;
$$;

revoke all on function public.request_and_post_warehouse_admin_correction(uuid, uuid, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.request_and_post_warehouse_admin_correction(uuid, uuid, text, text, text, jsonb, text)
  to service_role;

-- Allows a Full Admin to finish one of their own historical corrections that
-- was created before admin_auto existed. It uses the same balanced posting
-- path and never rewrites or deletes the correction document.
create or replace function public.post_existing_warehouse_admin_correction(
  p_correction_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_correction public.warehouse_corrections%rowtype;
  v_transfer_id uuid;
  v_brand_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_id
      and p.is_admin is true
      and p.role::text = 'admin'
  ) then
    raise exception 'FULL_ADMIN_REQUIRED';
  end if;

  select wc.transfer_id into v_transfer_id
  from public.warehouse_corrections wc
  where wc.id = p_correction_id;
  if v_transfer_id is null then raise exception 'CORRECTION_NOT_FOUND'; end if;

  select wt.brand_id into v_brand_id
  from public.warehouse_transfers wt
  where wt.id = v_transfer_id;
  if v_brand_id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;

  perform 1 from public.brands b where b.id = v_brand_id for update;
  perform 1 from public.warehouse_transfers wt where wt.id = v_transfer_id for update;
  select * into v_correction
  from public.warehouse_corrections wc
  where wc.id = p_correction_id
  for update;

  if v_correction.status = 'posted' then
    return jsonb_build_object(
      'correctionId', v_correction.id,
      'correctionNumber', v_correction.correction_number,
      'status', 'posted',
      'approvalMode', v_correction.approval_mode,
      'replayed', true
    );
  end if;
  if v_correction.status <> 'pending_approval' then raise exception 'CORRECTION_NOT_PENDING'; end if;
  if v_correction.requested_by is distinct from p_actor_id then raise exception 'ADMIN_CAN_ONLY_AUTO_POST_OWN_CORRECTION'; end if;

  perform pg_catalog.set_config('app.warehouse_admin_auto_post_in_progress', 'on', true);

  update public.warehouse_corrections
  set requested_by = null,
      approval_mode = 'admin_auto'
  where id = p_correction_id;

  v_result := public.approve_warehouse_correction_v2(p_correction_id, p_actor_id);

  update public.warehouse_corrections
  set requested_by = p_actor_id,
      approval_mode = 'admin_auto'
  where id = p_correction_id;

  perform pg_catalog.set_config('app.warehouse_admin_auto_post_in_progress', 'off', true);

  return v_result || jsonb_build_object('approvalMode', 'admin_auto', 'status', 'posted');
end;
$$;

revoke all on function public.post_existing_warehouse_admin_correction(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.post_existing_warehouse_admin_correction(uuid, uuid)
  to service_role;
