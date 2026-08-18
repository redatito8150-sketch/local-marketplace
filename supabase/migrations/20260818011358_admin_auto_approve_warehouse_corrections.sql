-- Full Admin corrections are trusted operational postings. They keep the
-- original receipt immutable and use the same balanced correction ledger,
-- but do not wait for a second administrator. Delegated warehouse roles keep
-- the existing four-eyes workflow.

alter table public.warehouse_corrections
  add column if not exists approval_mode text not null default 'independent';

alter table public.warehouse_corrections
  drop constraint if exists warehouse_corrections_approval_mode_check;
alter table public.warehouse_corrections
  add constraint warehouse_corrections_approval_mode_check
  check (approval_mode in ('independent', 'admin_auto'));

-- The original independent-approver check was unnamed. Locate it by its
-- definition so this remains safe if PostgreSQL assigned a suffixed name.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_catalog.pg_constraint
    where conrelid = 'public.warehouse_corrections'::regclass
      and contype = 'c'
      and pg_catalog.pg_get_constraintdef(oid) ilike '%approved_by%requested_by%'
      and conname <> 'warehouse_corrections_independent_approver_check'
  loop
    execute pg_catalog.format(
      'alter table public.warehouse_corrections drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.warehouse_corrections
  drop constraint if exists warehouse_corrections_independent_approver_check;
alter table public.warehouse_corrections
  add constraint warehouse_corrections_independent_approver_check
  check (
    approval_mode = 'admin_auto'
    or approved_by is null
    or approved_by is distinct from requested_by
  );

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
  -- Validation, fingerprinting and request idempotency remain centralized in
  -- the ordinary request function.
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

  -- Match the posting functions' lock order: brand, transfer, correction.
  perform 1 from public.brands where id = v_brand_id for update;
  perform 1 from public.warehouse_transfers where id = p_transfer_id for update;
  select * into v_correction
  from public.warehouse_corrections
  where id = v_correction_id
  for update;

  if v_correction.status = 'posted' then
    return v_request || jsonb_build_object('approvalMode', v_correction.approval_mode, 'replayed', true);
  end if;
  if v_correction.status <> 'pending_approval' then raise exception 'CORRECTION_NOT_PENDING'; end if;
  if v_correction.requested_by is distinct from p_actor_id then raise exception 'IDEMPOTENCY_ACTOR_CONFLICT'; end if;

  -- Both existing posting guards intentionally reject self-approval. Nulling
  -- requested_by only inside this transaction lets us reuse those audited,
  -- balanced posting functions; the final row restores the real requester.
  update public.warehouse_corrections
  set requested_by = null,
      approval_mode = 'admin_auto'
  where id = v_correction_id;

  v_result := public.approve_warehouse_correction_v2(v_correction_id, p_actor_id);

  update public.warehouse_corrections
  set requested_by = p_actor_id,
      approval_mode = 'admin_auto'
  where id = v_correction_id;

  return v_result || jsonb_build_object('approvalMode', 'admin_auto', 'status', 'posted');
end;
$$;

revoke all on function public.request_and_post_warehouse_admin_correction(uuid, uuid, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.request_and_post_warehouse_admin_correction(uuid, uuid, text, text, text, jsonb, text)
  to service_role;
