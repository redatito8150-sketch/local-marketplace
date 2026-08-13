-- ============================================================================
-- Extends the existing warehouse_transfers/warehouse_transfer_items pair
-- into a richer shipment-document model, in place — rather than five new
-- document tables, per this migration's design note (see the plan this
-- branch was built from). direction ('to_local' | 'to_brand') already
-- distinguishes a Stock Transfer Note (brand -> Zakhnook) from a Stock
-- Return Note (Zakhnook -> brand); a "Discrepancy Report" is the existing
-- damaged/missing line data plus a new has_discrepancy flag, not a sixth
-- table. Historical rows keep their literal old status
-- ('pending'/'received'/'rejected') and null document_number/document_type
-- forever — the status CHECK is widened to a UNION of old and new values,
-- never rewritten.
-- ============================================================================

alter table public.warehouse_transfers
  add column if not exists document_number text,
  add column if not exists document_type text,
  add column if not exists has_discrepancy boolean not null default false,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz;

create unique index if not exists warehouse_transfers_document_number_key
  on public.warehouse_transfers (document_number) where document_number is not null;

alter table public.warehouse_transfers drop constraint if exists warehouse_transfers_document_type_check;
alter table public.warehouse_transfers add constraint warehouse_transfers_document_type_check
  check (document_type is null or document_type in ('stock_transfer_note', 'stock_return_note'));

alter table public.warehouse_transfers drop constraint if exists warehouse_transfers_status_check;
alter table public.warehouse_transfers add constraint warehouse_transfers_status_check
  check (status in (
    -- legacy values, kept forever for historical rows:
    'pending', 'received', 'rejected',
    -- new richer lifecycle:
    'draft', 'submitted', 'approved', 'in_transit', 'receiving',
    'partially_received', 'cancelled'
  ));

alter table public.warehouse_transfer_items
  add column if not exists returned_qty integer;
alter table public.warehouse_transfer_items drop constraint if exists warehouse_transfer_items_returned_qty_check;
alter table public.warehouse_transfer_items add constraint warehouse_transfer_items_returned_qty_check
  check (returned_qty is null or returned_qty >= 0);

-- ============================================================================
-- Sequential, human-readable document numbers — mirrors brand_sku_counters/
-- next_product_sku's dedicated-counter-table pattern (atomic via
-- INSERT ... ON CONFLICT ... RETURNING, no application-level locking needed,
-- no reuse), a more rigorous scheme than orders.order_number's random-digit
-- style, appropriate for a formal warehouse document.
-- ============================================================================
create table if not exists public.warehouse_document_counters (
  direction text primary key check (direction in ('to_local', 'to_brand')),
  last_value bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.warehouse_document_counters enable row level security;
revoke all on public.warehouse_document_counters from public, anon, authenticated;
grant select, insert, update on public.warehouse_document_counters to service_role;

create or replace function public.next_warehouse_document_number(p_direction text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_next bigint;
begin
  if p_direction not in ('to_local', 'to_brand') then raise exception 'INVALID_TRANSFER_DIRECTION'; end if;
  v_prefix := case when p_direction = 'to_local' then 'STN' else 'SRN' end;

  insert into public.warehouse_document_counters (direction, last_value)
  values (p_direction, 1)
  on conflict (direction) do update
    set last_value = warehouse_document_counters.last_value + 1, updated_at = now()
  returning last_value into v_next;

  return v_prefix || '-' || lpad(v_next::text, 6, '0');
end;
$$;

revoke all on function public.next_warehouse_document_number(text) from public, anon, authenticated;
grant execute on function public.next_warehouse_document_number(text) to service_role;

-- Give every future document a number/type at creation. Same signature as
-- before (purely additive body change) — existing callers (the brand-portal
-- transfer/return routes) are unaffected.
create or replace function public.request_warehouse_return(
  p_brand_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text,
  p_operation_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_partner boolean;
  v_existing record;
  v_transfer_id uuid;
  v_item jsonb;
  v_variant record;
  v_lock record;
  v_requested integer;
  v_legacy_pending integer;
  v_input_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_document_number text;
begin
  if nullif(pg_catalog.btrim(p_operation_key), '') is null
     or length(p_operation_key) > 160 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select count(*), count(distinct input.value->>'variant_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_items) as input(value);
  if v_distinct_count <> v_input_count then
    raise exception 'DUPLICATE_OR_INVALID_VARIANT';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) as input(value)
  loop
    v_requested := (v_item->>'requested_qty')::integer;
    if v_requested is null or v_requested <= 0 then
      raise exception 'INVALID_REQUESTED_QUANTITY';
    end if;
  end loop;

  select is_mahaly_partner into v_is_partner
  from public.brands where id = p_brand_id for update;
  if v_is_partner is null then raise exception 'BRAND_NOT_FOUND'; end if;
  if not v_is_partner then raise exception 'BRAND_NOT_PARTNER'; end if;

  select id, brand_id, direction, request_payload into v_existing
  from public.warehouse_transfers
  where operation_key = p_operation_key;
  if v_existing.id is not null then
    if v_existing.brand_id <> p_brand_id
       or v_existing.direction <> 'to_brand'
       or (v_existing.request_payload is not null and v_existing.request_payload <> p_items) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing.id;
  end if;

  select count(*) into v_matched_count
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  join jsonb_array_elements(p_items) as input(value)
    on pv.id = (input.value->>'variant_id')::uuid
  where p.brand_id = p_brand_id;
  if v_matched_count <> v_input_count then
    raise exception 'VARIANT_NOT_FOUND_FOR_BRAND';
  end if;

  for v_lock in
    select pv.id
    from public.product_variants pv
    join jsonb_array_elements(p_items) as input(value)
      on pv.id = (input.value->>'variant_id')::uuid
    order by pv.id
    for update of pv
  loop
    null;
  end loop;

  v_document_number := public.next_warehouse_document_number('to_brand');

  insert into public.warehouse_transfers (
    brand_id, requested_by, brand_note, operation_key, direction,
    stock_reserved_at, request_payload, document_number, document_type
  ) values (
    p_brand_id, p_actor_id, nullif(pg_catalog.btrim(p_note), ''),
    p_operation_key, 'to_brand', now(), p_items, v_document_number, 'stock_return_note'
  ) returning id into v_transfer_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items) as input(value)
    order by (value->>'variant_id')::uuid
  loop
    v_requested := (v_item->>'requested_qty')::integer;
    select pv.id, pv.quantity, pv.product_id into v_variant
    from public.product_variants pv
    where pv.id = (v_item->>'variant_id')::uuid;

    select coalesce(sum(wti.requested_qty), 0) into v_legacy_pending
    from public.warehouse_transfer_items wti
    join public.warehouse_transfers wt on wt.id = wti.transfer_id
    where wti.variant_id = v_variant.id
      and wt.status = 'pending'
      and wt.direction = 'to_brand'
      and wt.stock_reserved_at is null;

    if v_requested > v_variant.quantity - v_legacy_pending then
      raise exception 'INSUFFICIENT_SELLABLE_STOCK';
    end if;

    update public.product_variants
    set quantity = quantity - v_requested, updated_at = now()
    where id = v_variant.id;

    insert into public.warehouse_transfer_items (
      transfer_id, variant_id, requested_qty, item_note
    ) values (
      v_transfer_id, v_variant.id, v_requested,
      nullif(pg_catalog.btrim(v_item->>'item_note'), '')
    );

    insert into public.inventory_movements (
      variant_id, product_id, brand_id, previous_quantity, quantity_delta,
      new_quantity, movement_type, reason, note, created_by, source,
      source_operation_key, from_location, to_location,
      related_entity_type, related_entity_id
    ) values (
      v_variant.id, v_variant.product_id, p_brand_id, v_variant.quantity,
      -v_requested, v_variant.quantity - v_requested,
      'warehouse_return_reserved', 'Local Warehouse Return Reserved',
      nullif(pg_catalog.btrim(v_item->>'item_note'), ''), p_actor_id,
      'warehouse_transfer',
      'warehouse-return-reserve:' || v_transfer_id::text || ':' || v_variant.id::text,
      'zakhnook_available', 'returned_to_brand', 'warehouse_document', v_transfer_id
    );
  end loop;

  return v_transfer_id;
end;
$$;

create or replace function public.request_warehouse_transfer(
  p_brand_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text,
  p_operation_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_partner boolean;
  v_existing record;
  v_transfer_id uuid;
  v_item jsonb;
  v_variant record;
  v_lock record;
  v_requested integer;
  v_already_pending integer;
  v_input_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_document_number text;
begin
  if nullif(pg_catalog.btrim(p_operation_key), '') is null
     or length(p_operation_key) > 160 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select count(*), count(distinct input.value->>'variant_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_items) as input(value);
  if v_distinct_count <> v_input_count then
    raise exception 'DUPLICATE_OR_INVALID_VARIANT';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) as input(value)
  loop
    v_requested := (v_item->>'requested_qty')::integer;
    if v_requested is null or v_requested <= 0 then
      raise exception 'INVALID_REQUESTED_QUANTITY';
    end if;
    if nullif(v_item->>'unit_cost', '') is not null
       and (v_item->>'unit_cost')::numeric < 0 then
      raise exception 'INVALID_UNIT_COST';
    end if;
  end loop;

  select is_mahaly_partner into v_is_partner
  from public.brands where id = p_brand_id for update;
  if v_is_partner is null then raise exception 'BRAND_NOT_FOUND'; end if;
  if not v_is_partner then raise exception 'BRAND_NOT_PARTNER'; end if;

  select id, brand_id, direction, request_payload into v_existing
  from public.warehouse_transfers
  where operation_key = p_operation_key;
  if v_existing.id is not null then
    if v_existing.brand_id <> p_brand_id
       or v_existing.direction <> 'to_local'
       or (v_existing.request_payload is not null and v_existing.request_payload <> p_items) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing.id;
  end if;

  select count(*) into v_matched_count
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  join jsonb_array_elements(p_items) as input(value)
    on pv.id = (input.value->>'variant_id')::uuid
  where p.brand_id = p_brand_id;
  if v_matched_count <> v_input_count then
    raise exception 'VARIANT_NOT_FOUND_FOR_BRAND';
  end if;

  for v_lock in
    select pv.id
    from public.product_variants pv
    join jsonb_array_elements(p_items) as input(value)
      on pv.id = (input.value->>'variant_id')::uuid
    order by pv.id
    for update of pv
  loop
    null;
  end loop;

  v_document_number := public.next_warehouse_document_number('to_local');

  insert into public.warehouse_transfers (
    brand_id, requested_by, brand_note, operation_key, direction,
    request_payload, document_number, document_type
  ) values (
    p_brand_id, p_actor_id, nullif(pg_catalog.btrim(p_note), ''),
    p_operation_key, 'to_local', p_items, v_document_number, 'stock_transfer_note'
  ) returning id into v_transfer_id;

  for v_item in
    select value
    from jsonb_array_elements(p_items) as input(value)
    order by (value->>'variant_id')::uuid
  loop
    v_requested := (v_item->>'requested_qty')::integer;
    select id, brand_stock_quantity into v_variant
    from public.product_variants
    where id = (v_item->>'variant_id')::uuid;

    select coalesce(sum(wti.requested_qty), 0) into v_already_pending
    from public.warehouse_transfer_items wti
    join public.warehouse_transfers wt on wt.id = wti.transfer_id
    where wti.variant_id = v_variant.id
      and wt.status = 'pending'
      and wt.direction = 'to_local';

    if v_requested > v_variant.brand_stock_quantity - v_already_pending then
      raise exception 'INSUFFICIENT_BRAND_STOCK';
    end if;

    insert into public.warehouse_transfer_items (
      transfer_id, variant_id, requested_qty, unit_cost, item_note
    ) values (
      v_transfer_id, v_variant.id, v_requested,
      nullif(v_item->>'unit_cost', '')::numeric,
      nullif(pg_catalog.btrim(v_item->>'item_note'), '')
    );
  end loop;

  return v_transfer_id;
end;
$$;

-- ============================================================================
-- Document status progression (draft is never entered by the current
-- creation RPCs above — they start at 'pending', functionally equivalent to
-- 'submitted' — these three are for a future richer creation flow and for
-- admin-side progression before receiving).
-- ============================================================================
create or replace function public.submit_warehouse_document(p_transfer_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.warehouse_transfers where id = p_transfer_id for update;
  if v_status is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_status <> 'draft' then raise exception 'DOCUMENT_NOT_DRAFT'; end if;
  update public.warehouse_transfers set status = 'submitted', updated_at = now() where id = p_transfer_id;
  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'submitted');
end; $$;

create or replace function public.approve_warehouse_document(p_transfer_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.warehouse_transfers where id = p_transfer_id for update;
  if v_status is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_status not in ('pending', 'submitted') then raise exception 'DOCUMENT_NOT_SUBMITTED'; end if;
  update public.warehouse_transfers
  set status = 'approved', approved_by = p_actor_id, approved_at = now(), updated_at = now()
  where id = p_transfer_id;
  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'approved');
end; $$;

create or replace function public.mark_warehouse_document_in_transit(p_transfer_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.warehouse_transfers where id = p_transfer_id for update;
  if v_status is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_status not in ('pending', 'submitted', 'approved') then raise exception 'DOCUMENT_NOT_APPROVED'; end if;
  update public.warehouse_transfers set status = 'in_transit', updated_at = now() where id = p_transfer_id;
  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'in_transit');
end; $$;

create or replace function public.cancel_warehouse_document(p_transfer_id uuid, p_actor_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  select status into v_status from public.warehouse_transfers where id = p_transfer_id for update;
  if v_status is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_status not in ('draft', 'pending', 'submitted', 'approved') then
    raise exception 'DOCUMENT_CANNOT_BE_CANCELLED_ONCE_IN_TRANSIT_OR_DECIDED';
  end if;
  update public.warehouse_transfers
  set status = 'cancelled', decided_by = p_actor_id, decided_at = now(),
      receiving_note = coalesce(nullif(pg_catalog.btrim(p_note), ''), receiving_note), updated_at = now()
  where id = p_transfer_id;
  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'cancelled');
end; $$;

-- ============================================================================
-- private.receive_warehouse_document_canonical — supersedes
-- private.receive_warehouse_transfer_canonical, allowing a SUBSET of a
-- document's not-yet-reconciled lines per call ("partial receiving").
-- status becomes 'partially_received' until every line has been reconciled
-- at least once, then 'received'. has_discrepancy is set true the moment
-- any reconciled line (ever, across however many partial calls) had
-- damaged/missing > 0 — this IS the "Discrepancy Report."
-- Reconciliation math (received_ok + damaged + missing = requested) and the
-- product_variants/inventory_movements writes are unchanged from the
-- original canonical function.
-- ============================================================================
create or replace function private.receive_warehouse_document_canonical(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text,
  p_expected_direction text
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
  v_matched_count integer;
  v_unreconciled_count integer;
  v_already_reconciled_count integer;
  v_remaining_after integer;
  v_item_row record;
  v_variant record;
  v_lock record;
  v_ok integer;
  v_damaged integer;
  v_missing integer;
  v_new_quantity integer;
  v_new_brand_stock integer;
  v_has_discrepancy boolean := false;
  v_results jsonb := '[]'::jsonb;
  v_final_status text;
begin
  if p_expected_direction not in ('to_local', 'to_brand') then
    raise exception 'INVALID_TRANSFER_DIRECTION';
  end if;

  select id, brand_id, status, direction, stock_reserved_at, has_discrepancy into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.direction <> p_expected_direction then raise exception 'TRANSFER_DIRECTION_MISMATCH'; end if;
  if v_transfer.status not in ('pending', 'submitted', 'approved', 'in_transit', 'partially_received') then
    raise exception 'TRANSFER_ALREADY_DECIDED';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select count(*), count(distinct input.value->>'item_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_items) as input(value);
  if v_distinct_count <> v_input_count then
    raise exception 'DUPLICATE_OR_INVALID_TRANSFER_ITEM';
  end if;

  -- Every submitted item must belong to this document and not already be
  -- reconciled from an earlier partial call.
  select count(*) into v_matched_count
  from public.warehouse_transfer_items wti
  join jsonb_array_elements(p_items) as input(value)
    on wti.id = (input.value->>'item_id')::uuid
  where wti.transfer_id = p_transfer_id and wti.received_ok_qty is null;
  if v_matched_count <> v_input_count then
    raise exception 'TRANSFER_ITEM_NOT_FOUND_OR_ALREADY_RECONCILED';
  end if;

  for v_lock in
    select pv.id
    from public.product_variants pv
    join public.warehouse_transfer_items wti on wti.variant_id = pv.id
    join jsonb_array_elements(p_items) as input(value) on wti.id = (input.value->>'item_id')::uuid
    where wti.transfer_id = p_transfer_id
    order by pv.id
    for update of pv
  loop
    null;
  end loop;

  for v_item_row in
    select wti.id, wti.variant_id, wti.requested_qty, submitted.payload
    from public.warehouse_transfer_items wti
    join lateral (
      select input.value as payload
      from jsonb_array_elements(p_items) as input(value)
      where input.value->>'item_id' = wti.id::text
    ) submitted on true
    where wti.transfer_id = p_transfer_id
    order by wti.id
  loop
    v_ok := coalesce((v_item_row.payload->>'received_ok_qty')::integer, 0);
    v_damaged := coalesce((v_item_row.payload->>'damaged_qty')::integer, 0);
    v_missing := coalesce((v_item_row.payload->>'missing_qty')::integer, 0);
    if v_ok < 0 or v_damaged < 0 or v_missing < 0 then
      raise exception 'INVALID_RECONCILIATION_QUANTITY';
    end if;
    if v_ok + v_damaged + v_missing <> v_item_row.requested_qty then
      raise exception 'TRANSFER_ITEM_NOT_RECONCILED';
    end if;
    if v_damaged > 0 or v_missing > 0 then v_has_discrepancy := true; end if;

    select id, quantity, product_id, brand_stock_quantity into v_variant
    from public.product_variants where id = v_item_row.variant_id;

    if p_expected_direction = 'to_local' then
      if v_variant.brand_stock_quantity < v_item_row.requested_qty then
        raise exception 'INSUFFICIENT_BRAND_STOCK_AT_RECEIPT';
      end if;
      v_new_quantity := v_variant.quantity + v_ok;
      v_new_brand_stock := v_variant.brand_stock_quantity - v_item_row.requested_qty;
    else
      if v_transfer.stock_reserved_at is null then
        if v_variant.quantity < v_item_row.requested_qty then
          raise exception 'INSUFFICIENT_SELLABLE_STOCK_AT_RETURN';
        end if;
        v_new_quantity := v_variant.quantity - v_item_row.requested_qty;
      else
        v_new_quantity := v_variant.quantity;
      end if;
      v_new_brand_stock := v_variant.brand_stock_quantity + v_ok;
    end if;

    update public.product_variants
    set quantity = v_new_quantity,
        brand_stock_quantity = v_new_brand_stock,
        updated_at = now()
    where id = v_variant.id;

    if v_new_quantity <> v_variant.quantity then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
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
        'warehouse_document', p_transfer_id
      );
    end if;

    if v_damaged > 0 then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id, 0, 0, 0,
        'warehouse_quarantine_hold', 'Damaged/missing units held in quarantine',
        nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''), p_actor_id,
        'warehouse_transfer',
        'warehouse-quarantine:' || p_transfer_id::text || ':' || v_item_row.id::text,
        case when p_expected_direction = 'to_local' then 'in_transit_to_zakhnook' else 'zakhnook_available' end,
        'zakhnook_quarantine', 'warehouse_document', p_transfer_id
      );
    end if;

    update public.warehouse_transfer_items
    set received_ok_qty = v_ok,
        damaged_qty = v_damaged,
        missing_qty = v_missing,
        item_note = coalesce(
          nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''),
          item_note
        )
    where id = v_item_row.id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant.id,
      'received_ok_qty', v_ok,
      'damaged_qty', v_damaged,
      'missing_qty', v_missing,
      'new_quantity', v_new_quantity
    ));
  end loop;

  select count(*) into v_remaining_after
  from public.warehouse_transfer_items
  where transfer_id = p_transfer_id and received_ok_qty is null;

  v_final_status := case when v_remaining_after = 0 then 'received' else 'partially_received' end;

  update public.warehouse_transfers
  set status = v_final_status,
      decided_by = case when v_final_status = 'received' then p_actor_id else decided_by end,
      decided_at = case when v_final_status = 'received' then now() else decided_at end,
      receiving_note = coalesce(nullif(pg_catalog.btrim(p_note), ''), receiving_note),
      has_discrepancy = has_discrepancy or v_has_discrepancy,
      updated_at = now()
  where id = p_transfer_id;

  return jsonb_build_object('items', v_results, 'status', v_final_status, 'remaining_unreconciled', v_remaining_after);
end;
$$;

-- Back-compat wrappers, unchanged signatures — Codex's UI (and the admin
-- receive route) can keep calling these exactly as before. Submitting every
-- line in one call (the only thing the old callers ever did) still resolves
-- straight to 'received', identical to the old behavior.
create or replace function public.receive_warehouse_return(
  p_transfer_id uuid, p_actor_id uuid, p_items jsonb, p_note text
) returns jsonb language sql security definer set search_path = '' as $$
  select private.receive_warehouse_document_canonical(p_transfer_id, p_actor_id, p_items, p_note, 'to_brand');
$$;

create or replace function public.receive_warehouse_transfer(
  p_transfer_id uuid, p_actor_id uuid, p_items jsonb, p_note text
) returns jsonb language sql security definer set search_path = '' as $$
  select private.receive_warehouse_document_canonical(p_transfer_id, p_actor_id, p_items, p_note, 'to_local');
$$;

-- New, explicitly-named entry points for a future partial-receiving UI —
-- identical bodies to the two wrappers above, just named to match the
-- "document" vocabulary this migration introduces.
create or replace function public.receive_warehouse_document(
  p_transfer_id uuid, p_actor_id uuid, p_items jsonb, p_note text, p_direction text
) returns jsonb language sql security definer set search_path = '' as $$
  select private.receive_warehouse_document_canonical(p_transfer_id, p_actor_id, p_items, p_note, p_direction);
$$;

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
  v_item record;
  v_variant record;
  v_lock record;
begin
  select id, brand_id, status, direction, stock_reserved_at into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.status not in ('pending', 'submitted', 'approved', 'in_transit') then
    raise exception 'TRANSFER_ALREADY_DECIDED';
  end if;

  if v_transfer.direction = 'to_brand' and v_transfer.stock_reserved_at is not null then
    for v_lock in
      select pv.id
      from public.product_variants pv
      join public.warehouse_transfer_items wti on wti.variant_id = pv.id
      where wti.transfer_id = p_transfer_id
      order by pv.id
      for update of pv
    loop
      null;
    end loop;

    for v_item in
      select id, variant_id, requested_qty
      from public.warehouse_transfer_items
      where transfer_id = p_transfer_id
      order by variant_id
    loop
      select id, product_id, quantity into v_variant
      from public.product_variants where id = v_item.variant_id;

      update public.product_variants
      set quantity = quantity + v_item.requested_qty, updated_at = now()
      where id = v_variant.id;

      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key, from_location, to_location,
        related_entity_type, related_entity_id
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id,
        v_variant.quantity, v_item.requested_qty,
        v_variant.quantity + v_item.requested_qty,
        'warehouse_return_released', 'Local Warehouse Return Reservation Released',
        nullif(pg_catalog.btrim(p_note), ''), p_actor_id,
        'warehouse_transfer',
        'warehouse-return-release:' || p_transfer_id::text || ':' || v_item.id::text,
        'returned_to_brand', 'zakhnook_available', 'warehouse_document', p_transfer_id
      );
    end loop;
  end if;

  update public.warehouse_transfers
  set status = 'rejected',
      decided_by = p_actor_id,
      decided_at = now(),
      receiving_note = nullif(pg_catalog.btrim(p_note), ''),
      updated_at = now()
  where id = p_transfer_id;

  return jsonb_build_object('transfer_id', p_transfer_id, 'status', 'rejected');
end;
$$;

-- Back-compat name, unchanged callers keep working.
create or replace function public.reject_warehouse_transfer(
  p_transfer_id uuid, p_actor_id uuid, p_note text
) returns jsonb language sql security definer set search_path = '' as $$
  select public.reject_warehouse_document(p_transfer_id, p_actor_id, p_note);
$$;

revoke all on function private.receive_warehouse_document_canonical(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated, service_role;

revoke all on function public.request_warehouse_return(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.request_warehouse_return(uuid, uuid, jsonb, text, text) to service_role;
revoke all on function public.request_warehouse_transfer(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.request_warehouse_transfer(uuid, uuid, jsonb, text, text) to service_role;
revoke all on function public.receive_warehouse_return(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.receive_warehouse_return(uuid, uuid, jsonb, text) to service_role;
revoke all on function public.receive_warehouse_transfer(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.receive_warehouse_transfer(uuid, uuid, jsonb, text) to service_role;
revoke all on function public.receive_warehouse_document(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.receive_warehouse_document(uuid, uuid, jsonb, text, text) to service_role;
revoke all on function public.reject_warehouse_document(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_warehouse_document(uuid, uuid, text) to service_role;
revoke all on function public.reject_warehouse_transfer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reject_warehouse_transfer(uuid, uuid, text) to service_role;
revoke all on function public.submit_warehouse_document(uuid, uuid) from public, anon, authenticated;
grant execute on function public.submit_warehouse_document(uuid, uuid) to service_role;
revoke all on function public.approve_warehouse_document(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_warehouse_document(uuid, uuid) to service_role;
revoke all on function public.mark_warehouse_document_in_transit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_warehouse_document_in_transit(uuid, uuid) to service_role;
revoke all on function public.cancel_warehouse_document(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_warehouse_document(uuid, uuid, text) to service_role;
