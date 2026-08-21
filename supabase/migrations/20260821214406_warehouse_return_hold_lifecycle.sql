-- Canonical outbound return lifecycle:
-- sellable -> return hold -> in transit to brand -> brand stock.
-- Sellable quantity changes only when the hold is created or released.

alter table public.warehouse_transfers
  add column if not exists dispatch_note text;

alter table public.warehouse_transfer_items
  add column if not exists dispatched_qty integer,
  add column if not exists dispatch_item_note text,
  add column if not exists dispatched_by uuid references auth.users(id) on delete set null,
  add column if not exists dispatched_at timestamptz;

alter table public.warehouse_transfer_items
  drop constraint if exists warehouse_transfer_items_dispatched_qty_check;
alter table public.warehouse_transfer_items
  add constraint warehouse_transfer_items_dispatched_qty_check
  check (dispatched_qty is null or dispatched_qty > 0);

alter table public.inventory_movements
  drop constraint if exists inventory_movements_from_location_check;
alter table public.inventory_movements
  add constraint inventory_movements_from_location_check check (
    from_location is null or from_location in (
      'brand_location', 'in_transit_to_zakhnook', 'zakhnook_available',
      'zakhnook_quarantine', 'zakhnook_return_hold', 'in_transit_to_brand',
      'returned_to_brand', 'sold_or_removed'
    )
  );

alter table public.inventory_movements
  drop constraint if exists inventory_movements_to_location_check;
alter table public.inventory_movements
  add constraint inventory_movements_to_location_check check (
    to_location is null or to_location in (
      'brand_location', 'in_transit_to_zakhnook', 'zakhnook_available',
      'zakhnook_quarantine', 'zakhnook_return_hold', 'in_transit_to_brand',
      'returned_to_brand', 'sold_or_removed'
    )
  );

alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check check (movement_type in (
    'opening_balance', 'manual_adjustment', 'order_placed', 'order_cancelled',
    'return_restocked', 'admin_correction', 'legacy_opening_balance', 'import',
    'other', 'warehouse_transfer_received', 'warehouse_return_reserved',
    'warehouse_return_released', 'warehouse_transfer_shipped',
    'warehouse_return_dispatched', 'warehouse_return_completed',
    'warehouse_quarantine_hold', 'warehouse_quarantine_release',
    'fulfillment_transition_snapshot', 'warehouse_receipt_actual',
    'warehouse_reclassification_out', 'warehouse_reclassification_in',
    'warehouse_correction_adjustment', 'warehouse_discrepancy_resolution'
  ));

-- Keep the existing audited request/release functions and replace only their
-- physical route. Fail loudly if their deployed definitions ever drift.
do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
begin
  v_signature := pg_catalog.to_regprocedure(
    'public.request_warehouse_return(uuid,uuid,jsonb,text,text)'
  );
  if v_signature is null then raise exception 'request_warehouse_return is not installed'; end if;
  select pg_catalog.pg_get_functiondef(v_signature) into v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    '''zakhnook_available'', ''returned_to_brand'', ''warehouse_document'', v_transfer_id',
    '''zakhnook_available'', ''zakhnook_return_hold'', ''warehouse_document'', v_transfer_id'
  );
  if v_rewritten = v_definition then raise exception 'request_warehouse_return route rewrite did not match'; end if;
  v_definition := v_rewritten;
  v_rewritten := pg_catalog.replace(
    v_definition,
    '''Local Warehouse Return Reserved''',
    '''Stock Return Note placed on return hold'''
  );
  if v_rewritten = v_definition then raise exception 'request_warehouse_return reason rewrite did not match'; end if;
  execute v_rewritten;

  v_signature := pg_catalog.to_regprocedure(
    'private.release_reserved_outbound_stock(uuid,uuid,text,text)'
  );
  if v_signature is null then raise exception 'release_reserved_outbound_stock is not installed'; end if;
  select pg_catalog.pg_get_functiondef(v_signature) into v_definition;
  v_rewritten := pg_catalog.replace(
    v_definition,
    '''returned_to_brand'', ''zakhnook_available'', ''warehouse_document'', p_transfer_id',
    '''zakhnook_return_hold'', ''zakhnook_available'', ''warehouse_document'', p_transfer_id'
  );
  if v_rewritten = v_definition then raise exception 'return release route rewrite did not match'; end if;
  execute v_rewritten;
end;
$migration$;

-- The generic status transition remains available for inbound documents only.
-- Outbound returns must use dispatch_warehouse_return so no package can leave
-- Zakhnook before every Document line has been counted and recorded.
create or replace function public.mark_warehouse_document_in_transit(
  p_transfer_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer record;
begin
  select id, brand_id, status, direction, stock_reserved_at
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.status <> 'approved' then raise exception 'DOCUMENT_NOT_APPROVED'; end if;

  if v_transfer.direction = 'to_brand' then
    raise exception 'RETURN_DISPATCH_LINES_REQUIRED';
  end if;

  update public.warehouse_transfers
  set status = 'in_transit', updated_at = now()
  where id = p_transfer_id;

  return jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'in_transit',
    'direction', v_transfer.direction
  );
end;
$$;

revoke all on function public.mark_warehouse_document_in_transit(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.mark_warehouse_document_in_transit(uuid, uuid)
  to service_role;

-- Admin warehouse dispatch. Every requested line must be submitted exactly
-- once and counted in full. This stores the outbound facts before the status
-- changes, then records the physical return-hold -> in-transit route.
create or replace function public.dispatch_warehouse_return(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer record;
  v_input_count integer;
  v_distinct_count integer;
  v_document_count integer;
  v_matched_count integer;
  v_item record;
  v_qty integer;
  v_variant record;
  v_total integer := 0;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'DISPATCH_LINES_REQUIRED';
  end if;

  select id, brand_id, status, direction, stock_reserved_at
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.direction <> 'to_brand' then raise exception 'TRANSFER_DIRECTION_MISMATCH'; end if;
  if v_transfer.status <> 'approved' then raise exception 'DOCUMENT_NOT_APPROVED'; end if;
  if v_transfer.stock_reserved_at is null then raise exception 'RETURN_STOCK_NOT_RESERVED'; end if;

  select count(*), count(distinct input.value->>'item_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_items) input(value);
  if v_input_count <> v_distinct_count then raise exception 'DUPLICATE_OR_INVALID_TRANSFER_ITEM'; end if;

  select count(*) into v_document_count
  from public.warehouse_transfer_items
  where transfer_id = p_transfer_id and received_ok_qty is null;

  select count(*) into v_matched_count
  from public.warehouse_transfer_items wti
  join jsonb_array_elements(p_items) input(value)
    on wti.id = (input.value->>'item_id')::uuid
  where wti.transfer_id = p_transfer_id
    and wti.received_ok_qty is null
    and wti.dispatched_qty is null;

  if v_input_count <> v_document_count or v_matched_count <> v_document_count then
    raise exception 'EVERY_DISPATCH_LINE_REQUIRED';
  end if;

  for v_item in
    select wti.id, wti.variant_id, wti.requested_qty, input.value as payload
    from public.warehouse_transfer_items wti
    join jsonb_array_elements(p_items) input(value)
      on wti.id = (input.value->>'item_id')::uuid
    where wti.transfer_id = p_transfer_id
    order by wti.id
  loop
    v_qty := coalesce((v_item.payload->>'dispatched_qty')::integer, -1);
    if v_qty <> v_item.requested_qty then
      raise exception 'DISPATCH_QUANTITY_MUST_MATCH_REQUEST';
    end if;

    update public.warehouse_transfer_items
    set dispatched_qty = v_qty,
        dispatch_item_note = nullif(pg_catalog.btrim(v_item.payload->>'item_note'), ''),
        dispatched_by = p_actor_id,
        dispatched_at = pg_catalog.now()
    where id = v_item.id;

    select id, product_id, quantity into v_variant
    from public.product_variants
    where id = v_item.variant_id;

    insert into public.inventory_movements (
      variant_id, product_id, brand_id, previous_quantity, quantity_delta,
      new_quantity, movement_type, reason, note, created_by, source,
      source_operation_key, from_location, to_location,
      related_entity_type, related_entity_id
    ) values (
      v_variant.id, v_variant.product_id, v_transfer.brand_id,
      v_variant.quantity, 0, v_variant.quantity,
      'warehouse_return_dispatched', 'Stock Return Note dispatched to brand',
      nullif(pg_catalog.btrim(v_item.payload->>'item_note'), ''),
      p_actor_id, 'warehouse_transfer',
      'warehouse-return-dispatch:' || p_transfer_id::text || ':' || v_item.id::text,
      'zakhnook_return_hold', 'in_transit_to_brand',
      'warehouse_document', p_transfer_id
    );

    v_total := v_total + v_qty;
  end loop;

  update public.warehouse_transfers
  set status = 'in_transit',
      dispatch_note = nullif(pg_catalog.btrim(p_note), ''),
      updated_at = pg_catalog.now()
  where id = p_transfer_id;

  return jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'in_transit',
    'direction', 'to_brand',
    'line_count', v_document_count,
    'dispatched_units', v_total
  );
end;
$$;

revoke all on function public.dispatch_warehouse_return(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.dispatch_warehouse_return(uuid, uuid, jsonb, text)
  to service_role;

-- Outbound returns cannot be rejected after physical dispatch. Inbound
-- documents keep their existing rejection window.
create or replace function public.reject_warehouse_document(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer record;
begin
  select id, brand_id, status, direction, stock_reserved_at into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.status not in ('pending', 'submitted', 'approved', 'in_transit') then
    raise exception 'TRANSFER_ALREADY_DECIDED';
  end if;
  if v_transfer.direction = 'to_brand' and v_transfer.status = 'in_transit' then
    raise exception 'RETURN_CANNOT_BE_REJECTED_AFTER_DISPATCH';
  end if;

  perform private.release_reserved_outbound_stock(
    p_transfer_id, p_actor_id, p_note,
    'Stock Return Note hold released after rejection'
  );

  update public.warehouse_transfers
  set status = 'rejected', decided_by = p_actor_id, decided_at = now(),
      receiving_note = nullif(pg_catalog.btrim(p_note), ''), updated_at = now()
  where id = p_transfer_id;

  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'rejected');
end;
$$;

revoke all on function public.reject_warehouse_document(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reject_warehouse_document(uuid, uuid, text)
  to service_role;

-- Brand owners may withdraw either direction while it is still requested.
-- Outbound cancellation atomically releases the return hold back to sellable.
create or replace function public.cancel_own_requested_warehouse_document(
  p_transfer_id uuid,
  p_brand_id uuid,
  p_actor_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer record;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;
  if p_brand_id is null then raise exception 'BRAND_REQUIRED'; end if;
  if nullif(pg_catalog.btrim(p_note), '') is null then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;

  select id, brand_id, direction, status, decided_by
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.brand_id <> p_brand_id then raise exception 'WAREHOUSE_DOCUMENT_NOT_OWNED'; end if;
  if v_transfer.status = 'cancelled' and v_transfer.decided_by = p_actor_id then
    return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'cancelled', 'replayed', true);
  end if;
  if v_transfer.status <> 'pending' then raise exception 'WAREHOUSE_DOCUMENT_CANCELLATION_LOCKED'; end if;

  perform private.release_reserved_outbound_stock(
    p_transfer_id, p_actor_id, p_note,
    'Stock Return Note hold released after brand cancellation'
  );

  update public.warehouse_transfers
  set status = 'cancelled', decided_by = p_actor_id,
      decided_at = pg_catalog.now(), receiving_note = pg_catalog.btrim(p_note),
      updated_at = pg_catalog.now()
  where id = p_transfer_id;

  return jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'cancelled',
    'direction', v_transfer.direction,
    'replayed', false
  );
end;
$$;

revoke all on function public.cancel_own_requested_warehouse_document(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_own_requested_warehouse_document(uuid, uuid, uuid, text)
  to service_role;

-- Tighten the canonical receive gate and add the final zero-delta physical
-- movement while preserving every existing quantity, opening-stock and
-- discrepancy rule in the audited function.
do $migration$
declare
  v_signature regprocedure := pg_catalog.to_regprocedure(
    'private.receive_warehouse_document_canonical(uuid,uuid,jsonb,text,text)'
  );
  v_definition text;
  v_rewritten text;
  v_old text;
  v_new text;
begin
  if v_signature is null then raise exception 'receive_warehouse_document_canonical is not installed'; end if;
  select pg_catalog.pg_get_functiondef(v_signature) into v_definition;

  v_old := $old$if v_transfer.status not in ('pending', 'submitted', 'approved', 'in_transit', 'partially_received') then
    raise exception 'TRANSFER_ALREADY_DECIDED';
  end if;$old$;
  v_new := $new$if p_expected_direction = 'to_brand'
     and v_transfer.status not in ('in_transit', 'partially_received') then
    raise exception 'RETURN_MUST_BE_DISPATCHED_BEFORE_CONFIRMATION';
  elsif p_expected_direction = 'to_local'
     and v_transfer.status not in ('pending', 'submitted', 'approved', 'in_transit', 'partially_received') then
    raise exception 'TRANSFER_ALREADY_DECIDED';
  end if;$new$;
  v_rewritten := pg_catalog.replace(v_definition, v_old, v_new);
  if v_rewritten = v_definition then raise exception 'return receive status gate rewrite did not match'; end if;

  v_old := $old$if v_new_quantity <> v_variant.quantity then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id, is_opening_stock
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id,
        v_variant.quantity, v_new_quantity - v_variant.quantity,
        v_new_quantity, 'warehouse_transfer_received',
        case when p_expected_direction = 'to_brand'
          then 'Stock Return Note received'
          else 'Goods Receipt Note received'
        end,
        nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''),
        p_actor_id, 'warehouse_transfer',
        case when p_expected_direction = 'to_brand'
          then 'warehouse-return:' || p_transfer_id::text || ':' || v_item_row.id::text
          else 'warehouse-transfer:' || p_transfer_id::text || ':' || v_item_row.id::text
        end,
        case when p_expected_direction = 'to_local' then 'in_transit_to_zakhnook' else 'zakhnook_available' end,
        case when p_expected_direction = 'to_local' then 'zakhnook_available' else 'returned_to_brand' end,
        'warehouse_document', p_transfer_id, v_is_opening_stock
      );
    end if;$old$;
  v_new := $new$if p_expected_direction = 'to_brand' and v_ok > 0 then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id, is_opening_stock
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id,
        v_variant.quantity, 0, v_new_quantity,
        'warehouse_return_completed', 'Stock Return Note delivered to brand',
        nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''),
        p_actor_id, 'warehouse_transfer',
        'warehouse-return-complete:' || p_transfer_id::text || ':' || v_item_row.id::text,
        'in_transit_to_brand', 'brand_location',
        'warehouse_document', p_transfer_id, false
      );
    elsif v_new_quantity <> v_variant.quantity then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id, is_opening_stock
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id,
        v_variant.quantity, v_new_quantity - v_variant.quantity,
        v_new_quantity, 'warehouse_transfer_received', 'Goods Receipt Note received',
        nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''),
        p_actor_id, 'warehouse_transfer',
        'warehouse-transfer:' || p_transfer_id::text || ':' || v_item_row.id::text,
        'in_transit_to_zakhnook', 'zakhnook_available',
        'warehouse_document', p_transfer_id, v_is_opening_stock
      );
    end if;$new$;
  v_definition := v_rewritten;
  v_rewritten := pg_catalog.replace(v_definition, v_old, v_new);
  if v_rewritten = v_definition then raise exception 'return completion movement rewrite did not match'; end if;

  v_definition := v_rewritten;
  v_rewritten := pg_catalog.replace(
    v_definition,
    'case when p_expected_direction = ''to_local'' then ''in_transit_to_zakhnook'' else ''zakhnook_available'' end,',
    'case when p_expected_direction = ''to_local'' then ''in_transit_to_zakhnook'' else ''in_transit_to_brand'' end,'
  );
  if v_rewritten = v_definition then raise exception 'return discrepancy route rewrite did not match'; end if;

  execute v_rewritten;
end;
$migration$;

revoke all on function private.receive_warehouse_document_canonical(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated, service_role;

-- Brand-owned delivery confirmation. The route supplies the authenticated
-- brand and actor, but ownership and the complete-line rule are repeated in
-- the database so a service-role caller cannot accidentally finalize the
-- wrong brand's return or confirm only part of a package.
create or replace function public.confirm_warehouse_return_received(
  p_transfer_id uuid,
  p_brand_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer record;
  v_input_count integer;
  v_distinct_count integer;
  v_document_count integer;
  v_matched_count integer;
  v_line record;
  v_received integer;
  v_damaged integer;
  v_missing integer;
begin
  if p_actor_id is null then raise exception 'ACTOR_REQUIRED'; end if;
  if p_brand_id is null then raise exception 'BRAND_REQUIRED'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'RECEIPT_LINES_REQUIRED';
  end if;

  select id, brand_id, direction, status
  into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;

  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.brand_id <> p_brand_id then raise exception 'WAREHOUSE_DOCUMENT_NOT_OWNED'; end if;
  if v_transfer.direction <> 'to_brand' then raise exception 'TRANSFER_DIRECTION_MISMATCH'; end if;
  if v_transfer.status <> 'in_transit' then raise exception 'RETURN_NOT_AWAITING_BRAND_CONFIRMATION'; end if;

  select count(*), count(distinct input.value->>'item_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_items) input(value);
  if v_input_count <> v_distinct_count then raise exception 'DUPLICATE_OR_INVALID_TRANSFER_ITEM'; end if;

  select count(*) into v_document_count
  from public.warehouse_transfer_items
  where transfer_id = p_transfer_id and received_ok_qty is null;

  select count(*) into v_matched_count
  from public.warehouse_transfer_items wti
  join jsonb_array_elements(p_items) input(value)
    on wti.id = (input.value->>'item_id')::uuid
  where wti.transfer_id = p_transfer_id
    and wti.received_ok_qty is null
    and wti.dispatched_qty is not null;

  if v_input_count <> v_document_count or v_matched_count <> v_document_count then
    raise exception 'EVERY_RECEIPT_LINE_REQUIRED';
  end if;

  for v_line in
    select wti.id, wti.dispatched_qty, input.value as payload
    from public.warehouse_transfer_items wti
    join jsonb_array_elements(p_items) input(value)
      on wti.id = (input.value->>'item_id')::uuid
    where wti.transfer_id = p_transfer_id
    order by wti.id
  loop
    v_received := coalesce((v_line.payload->>'received_ok_qty')::integer, -1);
    v_damaged := coalesce((v_line.payload->>'damaged_qty')::integer, -1);
    v_missing := coalesce((v_line.payload->>'missing_qty')::integer, -1);
    if v_received < 0 or v_damaged < 0 or v_missing < 0
       or v_received + v_damaged + v_missing <> v_line.dispatched_qty then
      raise exception 'RETURN_RECEIPT_LINE_NOT_RECONCILED';
    end if;
  end loop;

  return private.receive_warehouse_document_canonical(
    p_transfer_id, p_actor_id, p_items, p_note, 'to_brand'
  );
end;
$$;

revoke all on function public.confirm_warehouse_return_received(uuid, uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.confirm_warehouse_return_received(uuid, uuid, uuid, jsonb, text)
  to service_role;
