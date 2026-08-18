-- Closed-document issue reporting without rewriting historical receipts.
--
-- This migration keeps the original warehouse receipt immutable and extends
-- the existing four-eyes correction workflow with:
--   1. move_to_hold: sellable stock discovered damaged after receipt.
--   2. source_correction_line_id: an append-only link used when that hold is
--      later restored, returned to the brand, or written off.
--   3. document_amendment: an approved note with no inventory movement.

alter table public.warehouse_corrections
  drop constraint if exists warehouse_corrections_correction_type_check;
alter table public.warehouse_corrections
  add constraint warehouse_corrections_correction_type_check check (
    correction_type in (
      'reclassification', 'quantity_adjustment', 'missing_recovery',
      'condition_resolution', 'document_amendment', 'reversal'
    )
  );

alter table public.warehouse_correction_lines
  add column if not exists source_correction_line_id uuid
  references public.warehouse_correction_lines(id) on delete restrict;

alter table public.warehouse_correction_lines
  drop constraint if exists warehouse_correction_lines_source_bucket_check;
alter table public.warehouse_correction_lines
  add constraint warehouse_correction_lines_source_bucket_check check (
    source_bucket is null or source_bucket in (
      'damaged', 'missing', 'substitution', 'excess', 'unidentified',
      'sellable', 'document'
    )
  );

alter table public.warehouse_correction_lines
  drop constraint if exists warehouse_correction_lines_action_check;
alter table public.warehouse_correction_lines
  add constraint warehouse_correction_lines_action_check check (
    action in (
      'reclassify', 'adjust_in', 'adjust_out', 'move_to_hold',
      'restore_to_sellable', 'return_to_brand', 'write_off',
      'accept_discrepancy'
    )
  );

alter table public.warehouse_correction_lines
  drop constraint if exists warehouse_correction_lines_check;
alter table public.warehouse_correction_lines
  add constraint warehouse_correction_lines_source_check check (
    ((source_receipt_line_id is null) = (source_bucket is null))
    and num_nonnulls(source_receipt_line_id, source_correction_line_id) <= 1
    and source_correction_line_id is distinct from id
  );

alter table public.warehouse_correction_lines
  drop constraint if exists warehouse_correction_lines_check1;
alter table public.warehouse_correction_lines
  add constraint warehouse_correction_lines_shape_check check (
    (action = 'reclassify' and from_variant_id is not null and to_variant_id is not null and from_variant_id <> to_variant_id)
    or (action in ('adjust_in', 'restore_to_sellable') and from_variant_id is null and to_variant_id is not null)
    or (action in ('adjust_out', 'move_to_hold', 'return_to_brand', 'write_off') and from_variant_id is not null and to_variant_id is null)
    or (action = 'accept_discrepancy' and from_variant_id is null and to_variant_id is null)
  );

create index if not exists warehouse_correction_lines_source_correction_idx
  on public.warehouse_correction_lines (source_correction_line_id)
  where source_correction_line_id is not null;

create or replace function public.request_warehouse_correction_v2(
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
  v_transfer record;
  v_existing public.warehouse_corrections%rowtype;
  v_correction public.warehouse_corrections%rowtype;
  v_line jsonb;
  v_line_count integer := 0;
  v_action text;
  v_source_bucket text;
  v_quantity integer;
  v_source_line record;
  v_source_available integer;
  v_source_used integer;
  v_hold_line record;
begin
  if nullif(pg_catalog.btrim(p_operation_key), '') is null or length(p_operation_key) > 160 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;
  if nullif(pg_catalog.btrim(p_note), '') is null or length(pg_catalog.btrim(p_note)) < 5 then
    raise exception 'CORRECTION_NOTE_REQUIRED';
  end if;
  if p_correction_type not in (
    'reclassification', 'quantity_adjustment', 'missing_recovery',
    'condition_resolution', 'document_amendment', 'reversal'
  ) then
    raise exception 'INVALID_CORRECTION_TYPE';
  end if;
  if p_reason_code not in (
    'wrong_variant', 'count_error', 'duplicate_receipt', 'missing_found',
    'damage_regraded', 'return_to_brand', 'write_off', 'document_error', 'other'
  ) then
    raise exception 'INVALID_CORRECTION_REASON';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
    or jsonb_array_length(p_lines) > 100
  then
    raise exception 'CORRECTION_LINES_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('warehouse-correction:' || p_transfer_id::text || ':' || p_operation_key, 0)
  );

  select * into v_existing
  from public.warehouse_corrections
  where transfer_id = p_transfer_id and operation_key = p_operation_key;
  if v_existing.id is not null then
    if v_existing.payload_fingerprint <> pg_catalog.md5(
      p_correction_type || '|' || p_reason_code || '|' || pg_catalog.btrim(p_note) || '|' || p_lines::text
    ) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'correctionId', v_existing.id,
      'correctionNumber', v_existing.correction_number,
      'status', v_existing.status,
      'replayed', true
    );
  end if;

  select id, brand_id, status into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.status not in ('received', 'partially_received') then
    raise exception 'CORRECTION_REQUIRES_POSTED_DOCUMENT';
  end if;

  insert into public.warehouse_corrections (
    transfer_id, correction_number, correction_type, status,
    reason_code, note, operation_key, payload_fingerprint, requested_by
  ) values (
    p_transfer_id, private.next_warehouse_aux_document_number('correction'),
    p_correction_type, 'pending_approval', p_reason_code,
    pg_catalog.btrim(p_note), p_operation_key,
    pg_catalog.md5(p_correction_type || '|' || p_reason_code || '|' || pg_catalog.btrim(p_note) || '|' || p_lines::text),
    p_actor_id
  ) returning * into v_correction;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_action := v_line->>'action';
    v_source_bucket := nullif(v_line->>'source_bucket', '');
    begin
      v_quantity := (v_line->>'quantity')::integer;
    exception when others then
      raise exception 'CORRECTION_QUANTITY_REQUIRED';
    end;

    if v_action not in (
      'reclassify', 'adjust_in', 'adjust_out', 'move_to_hold',
      'restore_to_sellable', 'return_to_brand', 'write_off',
      'accept_discrepancy'
    ) or v_quantity <= 0 then
      raise exception 'CORRECTION_QUANTITY_REQUIRED';
    end if;

    if p_correction_type = 'document_amendment' then
      if v_action <> 'accept_discrepancy' or v_quantity <> 1
        or nullif(v_line->>'source_correction_line_id', '') is not null
        or (v_source_bucket is not null and v_source_bucket <> 'document')
      then
        raise exception 'INVALID_DOCUMENT_AMENDMENT_LINE';
      end if;
    elsif v_source_bucket = 'document' then
      raise exception 'INVALID_DOCUMENT_AMENDMENT_LINE';
    end if;

    if nullif(v_line->>'source_receipt_line_id', '') is not null
      and nullif(v_line->>'source_correction_line_id', '') is not null
    then
      raise exception 'CORRECTION_SOURCE_CONFLICT';
    end if;

    if v_action in ('move_to_hold', 'restore_to_sellable', 'return_to_brand', 'write_off')
      and nullif(v_line->>'source_receipt_line_id', '') is null
      and nullif(v_line->>'source_correction_line_id', '') is null
    then
      raise exception 'CORRECTION_PHYSICAL_SOURCE_REQUIRED';
    end if;

    if nullif(v_line->>'source_receipt_line_id', '') is not null then
      select wrl.id, wrl.actual_damaged_qty, wrl.expected_missing_qty,
             wrl.actual_good_qty, wrl.actual_excess_qty, wrl.unidentified_qty,
             wr.transfer_id, wrl.actual_variant_id, wrl.expected_variant_id
      into v_source_line
      from public.warehouse_receipt_lines wrl
      join public.warehouse_receipts wr on wr.id = wrl.receipt_id
      where wrl.id = (v_line->>'source_receipt_line_id')::uuid
      for update of wrl;
      if v_source_line.id is null or v_source_line.transfer_id <> p_transfer_id then
        raise exception 'CORRECTION_RECEIPT_LINE_MISMATCH';
      end if;
      if v_source_bucket not in (
        'damaged', 'missing', 'substitution', 'excess', 'unidentified',
        'sellable', 'document'
      ) then
        raise exception 'CORRECTION_SOURCE_BUCKET_REQUIRED';
      end if;

      if v_source_bucket = 'damaged' and v_action not in ('restore_to_sellable', 'return_to_brand', 'write_off') then
        raise exception 'INVALID_DAMAGED_STOCK_RESOLUTION';
      elsif v_source_bucket = 'missing' and v_action not in ('adjust_in', 'accept_discrepancy') then
        raise exception 'INVALID_MISSING_STOCK_RESOLUTION';
      elsif v_source_bucket = 'substitution' and v_action not in ('reclassify', 'accept_discrepancy') then
        raise exception 'INVALID_SUBSTITUTION_RESOLUTION';
      elsif v_source_bucket = 'excess' and v_action not in ('adjust_out', 'accept_discrepancy') then
        raise exception 'INVALID_EXCESS_RESOLUTION';
      elsif v_source_bucket = 'unidentified' and v_action <> 'adjust_in' then
        raise exception 'INVALID_UNIDENTIFIED_STOCK_RESOLUTION';
      elsif v_source_bucket = 'sellable' and v_action not in ('move_to_hold', 'reclassify') then
        raise exception 'INVALID_SELLABLE_HOLD_ACTION';
      elsif v_source_bucket = 'document' and (p_correction_type <> 'document_amendment' or v_action <> 'accept_discrepancy') then
        raise exception 'INVALID_DOCUMENT_AMENDMENT_LINE';
      end if;

      if v_source_bucket = 'damaged' and (
        (v_action = 'restore_to_sellable' and nullif(v_line->>'to_variant_id', '')::uuid is distinct from v_source_line.actual_variant_id)
        or (v_action in ('return_to_brand', 'write_off') and nullif(v_line->>'from_variant_id', '')::uuid is distinct from v_source_line.actual_variant_id)
      ) then
        raise exception 'DAMAGED_RESOLUTION_VARIANT_MISMATCH';
      elsif v_source_bucket = 'missing' and v_action = 'adjust_in'
        and nullif(v_line->>'to_variant_id', '')::uuid is distinct from v_source_line.expected_variant_id
      then
        raise exception 'MISSING_RECOVERY_VARIANT_MISMATCH';
      elsif v_source_bucket = 'substitution' and (
        v_source_line.actual_variant_id is null
        or v_source_line.actual_variant_id = v_source_line.expected_variant_id
        or (v_action = 'reclassify' and (
          nullif(v_line->>'from_variant_id', '')::uuid is distinct from v_source_line.actual_variant_id
          or nullif(v_line->>'to_variant_id', '')::uuid is distinct from v_source_line.expected_variant_id
        ))
      ) then
        raise exception 'SUBSTITUTION_RESOLUTION_VARIANT_MISMATCH';
      elsif v_source_bucket = 'excess' and v_action = 'adjust_out'
        and nullif(v_line->>'from_variant_id', '')::uuid is distinct from v_source_line.actual_variant_id
      then
        raise exception 'EXCESS_RESOLUTION_VARIANT_MISMATCH';
      elsif v_source_bucket = 'sellable' and nullif(v_line->>'from_variant_id', '')::uuid
        is distinct from coalesce(v_source_line.actual_variant_id, v_source_line.expected_variant_id)
      then
        raise exception 'SELLABLE_HOLD_VARIANT_MISMATCH';
      end if;

      if v_source_bucket <> 'document' then
        v_source_available := case
          when v_source_bucket = 'damaged' then v_source_line.actual_damaged_qty
          when v_source_bucket = 'missing' then v_source_line.expected_missing_qty
          when v_source_bucket = 'substitution' then case
            when v_source_line.actual_variant_id is distinct from v_source_line.expected_variant_id
              then v_source_line.actual_good_qty
            else 0
          end
          when v_source_bucket = 'excess' then v_source_line.actual_excess_qty
          when v_source_bucket = 'sellable' then v_source_line.actual_good_qty
          else v_source_line.unidentified_qty
        end;
        select coalesce(sum(wcl.quantity), 0) into v_source_used
        from public.warehouse_correction_lines wcl
        join public.warehouse_corrections existing on existing.id = wcl.correction_id
        where wcl.source_receipt_line_id = v_source_line.id
          and wcl.source_bucket = v_source_bucket
          and existing.status in ('pending_approval', 'posted');
        if v_source_used + v_quantity > v_source_available then
          raise exception 'CORRECTION_EXCEEDS_OPEN_SOURCE_QUANTITY';
        end if;
      end if;
    end if;

    if nullif(v_line->>'source_correction_line_id', '') is not null then
      select source_line.id, source_line.quantity, source_line.from_variant_id,
             source_line.action, source_correction.transfer_id, source_correction.status
      into v_hold_line
      from public.warehouse_correction_lines source_line
      join public.warehouse_corrections source_correction on source_correction.id = source_line.correction_id
      where source_line.id = (v_line->>'source_correction_line_id')::uuid
      for update of source_line;
      if v_hold_line.id is null or v_hold_line.transfer_id <> p_transfer_id
        or v_hold_line.status <> 'posted' or v_hold_line.action <> 'move_to_hold'
      then
        raise exception 'CORRECTION_HOLD_SOURCE_INVALID';
      end if;
      if v_action not in ('restore_to_sellable', 'return_to_brand', 'write_off') then
        raise exception 'INVALID_HOLD_RESOLUTION';
      end if;
      if (v_action = 'restore_to_sellable' and nullif(v_line->>'to_variant_id', '')::uuid is distinct from v_hold_line.from_variant_id)
        or (v_action in ('return_to_brand', 'write_off') and nullif(v_line->>'from_variant_id', '')::uuid is distinct from v_hold_line.from_variant_id)
      then
        raise exception 'HOLD_RESOLUTION_VARIANT_MISMATCH';
      end if;
      select coalesce(sum(wcl.quantity), 0) into v_source_used
      from public.warehouse_correction_lines wcl
      join public.warehouse_corrections existing on existing.id = wcl.correction_id
      where wcl.source_correction_line_id = v_hold_line.id
        and existing.status in ('pending_approval', 'posted');
      if v_source_used + v_quantity > v_hold_line.quantity then
        raise exception 'CORRECTION_EXCEEDS_OPEN_HOLD_QUANTITY';
      end if;
    end if;

    insert into public.warehouse_correction_lines (
      correction_id, source_receipt_line_id, source_bucket,
      source_correction_line_id, action, from_variant_id, to_variant_id,
      quantity, note
    ) values (
      v_correction.id,
      nullif(v_line->>'source_receipt_line_id', '')::uuid,
      v_source_bucket,
      nullif(v_line->>'source_correction_line_id', '')::uuid,
      v_action,
      nullif(v_line->>'from_variant_id', '')::uuid,
      nullif(v_line->>'to_variant_id', '')::uuid,
      v_quantity,
      nullif(pg_catalog.btrim(v_line->>'note'), '')
    );
    v_line_count := v_line_count + 1;
  end loop;

  return jsonb_build_object(
    'correctionId', v_correction.id,
    'correctionNumber', v_correction.correction_number,
    'status', 'pending_approval',
    'lineCount', v_line_count,
    'replayed', false
  );
end;
$$;

revoke all on function public.request_warehouse_correction_v2(uuid, uuid, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.request_warehouse_correction_v2(uuid, uuid, text, text, text, jsonb, text)
  to service_role;

create or replace function private.prepare_closed_document_issue_actions(
  p_correction_id uuid,
  p_approver_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correction record;
  v_transfer record;
  v_line record;
  v_variant record;
  v_new_quantity integer;
begin
  select wc.id, wc.transfer_id, wc.status, wc.requested_by, wc.correction_number
  into v_correction
  from public.warehouse_corrections wc
  where wc.id = p_correction_id;
  if v_correction.id is null then raise exception 'CORRECTION_NOT_FOUND'; end if;

  select wt.id, wt.brand_id into v_transfer
  from public.warehouse_transfers wt
  where wt.id = v_correction.transfer_id;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  perform 1 from public.brands where id = v_transfer.brand_id for update;
  perform 1 from public.warehouse_transfers where id = v_transfer.id for update;

  select wc.id, wc.transfer_id, wc.status, wc.requested_by, wc.correction_number
  into v_correction
  from public.warehouse_corrections wc
  where wc.id = p_correction_id
  for update;
  if v_correction.status = 'posted' then return; end if;
  if v_correction.status <> 'pending_approval' then raise exception 'CORRECTION_NOT_PENDING'; end if;
  if v_correction.requested_by = p_approver_id then
    raise exception 'CORRECTION_REQUIRES_INDEPENDENT_APPROVER';
  end if;

  perform 1
  from public.product_variants pv
  where pv.id in (
    select from_variant_id
    from public.warehouse_correction_lines
    where correction_id = p_correction_id and action = 'move_to_hold'
  )
  order by pv.id
  for update;

  for v_line in
    select *
    from public.warehouse_correction_lines
    where correction_id = p_correction_id and action = 'move_to_hold'
    order by id
  loop
    select pv.id, pv.quantity, pv.product_id, p.brand_id
    into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_line.from_variant_id;
    if v_variant.id is null or v_variant.brand_id <> v_transfer.brand_id then
      raise exception 'CORRECTION_VARIANT_BRAND_MISMATCH';
    end if;
    if v_variant.quantity < v_line.quantity then
      raise exception 'CORRECTION_WOULD_GO_NEGATIVE';
    end if;

    v_new_quantity := v_variant.quantity - v_line.quantity;
    update public.product_variants
    set quantity = v_new_quantity, updated_at = now()
    where id = v_variant.id;

    insert into public.inventory_movements (
      variant_id, product_id, brand_id, previous_quantity, quantity_delta,
      new_quantity, movement_type, reason, note, created_by, source,
      source_operation_key, from_location, to_location,
      related_entity_type, related_entity_id
    ) values (
      v_variant.id, v_variant.product_id, v_transfer.brand_id,
      v_variant.quantity, -v_line.quantity, v_new_quantity,
      'warehouse_discrepancy_resolution',
      'Warehouse correction ' || v_correction.correction_number,
      nullif(pg_catalog.btrim(v_line.note), ''), p_approver_id,
      'warehouse_correction',
      'warehouse-correction:' || p_correction_id::text || ':' || v_line.id::text || ':hold',
      'zakhnook_available', 'zakhnook_quarantine',
      'warehouse_correction', p_correction_id
    );
  end loop;
end;
$$;

revoke all on function private.prepare_closed_document_issue_actions(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.approve_warehouse_correction_v2(
  p_correction_id uuid,
  p_approver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_transfer_id uuid;
begin
  perform private.prepare_closed_document_issue_actions(p_correction_id, p_approver_id);
  v_result := private.post_warehouse_correction(p_correction_id, p_approver_id);

  select transfer_id into v_transfer_id
  from public.warehouse_corrections
  where id = p_correction_id;

  if exists (
    select 1
    from public.warehouse_correction_lines hold_line
    join public.warehouse_corrections hold_correction
      on hold_correction.id = hold_line.correction_id
    where hold_correction.transfer_id = v_transfer_id
      and hold_correction.status = 'posted'
      and hold_line.action = 'move_to_hold'
      and hold_line.quantity > coalesce((
        select sum(resolution_line.quantity)
        from public.warehouse_correction_lines resolution_line
        join public.warehouse_corrections resolution_correction
          on resolution_correction.id = resolution_line.correction_id
        where resolution_line.source_correction_line_id = hold_line.id
          and resolution_correction.status = 'posted'
      ), 0)
  ) then
    update public.warehouse_transfers
    set reconciliation_status = 'partially_settled', updated_at = now()
    where id = v_transfer_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.approve_warehouse_correction_v2(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.approve_warehouse_correction_v2(uuid, uuid)
  to service_role;
