-- Warehouse transfers must reconcile the canonical database lines exactly.
-- Return requests reserve sellable stock immediately so checkout cannot sell
-- units that are already committed to leave Mahaly's warehouse.

alter table public.warehouse_transfers
  add column if not exists stock_reserved_at timestamptz,
  add column if not exists request_payload jsonb;

alter table public.warehouse_transfers
  drop constraint if exists warehouse_transfers_reservation_direction_check;
alter table public.warehouse_transfers
  add constraint warehouse_transfers_reservation_direction_check
  check (stock_reserved_at is null or direction = 'to_brand') not valid;

alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check check (movement_type in (
    'opening_balance', 'manual_adjustment', 'order_placed',
    'order_cancelled', 'return_restocked', 'admin_correction',
    'legacy_opening_balance', 'import', 'other',
    'warehouse_transfer_received', 'warehouse_return_reserved',
    'warehouse_return_released'
  ));

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

  -- Consistent variant lock ordering avoids deadlocks when a request spans
  -- multiple products.
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

  insert into public.warehouse_transfers (
    brand_id, requested_by, brand_note, operation_key, direction,
    stock_reserved_at, request_payload
  ) values (
    p_brand_id, p_actor_id, nullif(pg_catalog.btrim(p_note), ''),
    p_operation_key, 'to_brand', now(), p_items
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

    -- Legacy pending returns predate reservation support, so keep honoring
    -- their claim until they are received or rejected.
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
      source_operation_key
    ) values (
      v_variant.id, v_variant.product_id, p_brand_id, v_variant.quantity,
      -v_requested, v_variant.quantity - v_requested,
      'warehouse_return_reserved', 'Local Warehouse Return Reserved',
      nullif(pg_catalog.btrim(v_item->>'item_note'), ''), p_actor_id,
      'warehouse_transfer',
      'warehouse-return-reserve:' || v_transfer_id::text || ':' || v_variant.id::text
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

  insert into public.warehouse_transfers (
    brand_id, requested_by, brand_note, operation_key, direction,
    request_payload
  ) values (
    p_brand_id, p_actor_id, nullif(pg_catalog.btrim(p_note), ''),
    p_operation_key, 'to_local', p_items
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

create schema if not exists private;

create or replace function private.receive_warehouse_transfer_canonical(
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
  v_expected_count integer;
  v_matched_count integer;
  v_item_row record;
  v_variant record;
  v_lock record;
  v_ok integer;
  v_damaged integer;
  v_missing integer;
  v_new_quantity integer;
  v_new_brand_stock integer;
  v_results jsonb := '[]'::jsonb;
begin
  if p_expected_direction not in ('to_local', 'to_brand') then
    raise exception 'INVALID_TRANSFER_DIRECTION';
  end if;

  select id, brand_id, status, direction, stock_reserved_at into v_transfer
  from public.warehouse_transfers
  where id = p_transfer_id
  for update;
  if v_transfer.id is null then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if v_transfer.direction <> p_expected_direction then raise exception 'TRANSFER_DIRECTION_MISMATCH'; end if;
  if v_transfer.status <> 'pending' then raise exception 'TRANSFER_ALREADY_DECIDED'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'TRANSFER_ITEMS_REQUIRED';
  end if;

  select count(*), count(distinct input.value->>'item_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_items) as input(value);
  if v_distinct_count <> v_input_count then
    raise exception 'DUPLICATE_OR_INVALID_TRANSFER_ITEM';
  end if;

  select count(*) into v_expected_count
  from public.warehouse_transfer_items
  where transfer_id = p_transfer_id;
  if v_input_count <> v_expected_count then
    raise exception 'TRANSFER_ITEMS_INCOMPLETE';
  end if;

  select count(*) into v_matched_count
  from public.warehouse_transfer_items wti
  join jsonb_array_elements(p_items) as input(value)
    on wti.id = (input.value->>'item_id')::uuid
  where wti.transfer_id = p_transfer_id;
  if v_matched_count <> v_expected_count then
    raise exception 'TRANSFER_ITEM_NOT_FOUND';
  end if;

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
        source_operation_key
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id,
        v_variant.quantity, v_new_quantity - v_variant.quantity,
        v_new_quantity, 'warehouse_transfer_received',
        case when p_expected_direction = 'to_brand'
          then 'Legacy Local Warehouse Return'
          else 'Local Warehouse Transfer Received'
        end,
        nullif(pg_catalog.btrim(v_item_row.payload->>'item_note'), ''),
        p_actor_id, 'warehouse_transfer',
        case when p_expected_direction = 'to_brand'
          then 'warehouse-return:' || p_transfer_id::text || ':' || v_item_row.id::text
          else 'warehouse-transfer:' || p_transfer_id::text || ':' || v_item_row.id::text
        end
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

  update public.warehouse_transfers
  set status = 'received',
      decided_by = p_actor_id,
      decided_at = now(),
      receiving_note = nullif(pg_catalog.btrim(p_note), ''),
      updated_at = now()
  where id = p_transfer_id;

  return v_results;
end;
$$;

create or replace function public.receive_warehouse_return(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.receive_warehouse_transfer_canonical(
    p_transfer_id, p_actor_id, p_items, p_note, 'to_brand'
  );
$$;

create or replace function public.receive_warehouse_transfer(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.receive_warehouse_transfer_canonical(
    p_transfer_id, p_actor_id, p_items, p_note, 'to_local'
  );
$$;

create or replace function public.reject_warehouse_transfer(
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
  if v_transfer.status <> 'pending' then raise exception 'TRANSFER_ALREADY_DECIDED'; end if;

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
        source_operation_key
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id,
        v_variant.quantity, v_item.requested_qty,
        v_variant.quantity + v_item.requested_qty,
        'warehouse_return_released', 'Local Warehouse Return Reservation Released',
        nullif(pg_catalog.btrim(p_note), ''), p_actor_id,
        'warehouse_transfer',
        'warehouse-return-release:' || p_transfer_id::text || ':' || v_item.id::text
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

create or replace function public.set_warehouse_brand_stock(
  p_brand_id uuid,
  p_actor_id uuid,
  p_updates jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_partner boolean;
  v_input_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_update jsonb;
  v_quantity integer;
  v_pending integer;
  v_lock record;
begin
  if jsonb_typeof(p_updates) <> 'array' or jsonb_array_length(p_updates) = 0 then
    raise exception 'WAREHOUSE_STOCK_UPDATES_REQUIRED';
  end if;
  select count(*), count(distinct input.value->>'variant_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_updates) as input(value);
  if v_distinct_count <> v_input_count then
    raise exception 'DUPLICATE_OR_INVALID_VARIANT';
  end if;

  select is_mahaly_partner into v_is_partner
  from public.brands where id = p_brand_id for update;
  if v_is_partner is null then raise exception 'BRAND_NOT_FOUND'; end if;
  if not v_is_partner then raise exception 'BRAND_NOT_PARTNER'; end if;

  select count(*) into v_matched_count
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  join jsonb_array_elements(p_updates) as input(value)
    on pv.id = (input.value->>'variant_id')::uuid
  where p.brand_id = p_brand_id;
  if v_matched_count <> v_input_count then
    raise exception 'VARIANT_NOT_FOUND_FOR_BRAND';
  end if;

  for v_lock in
    select pv.id
    from public.product_variants pv
    join jsonb_array_elements(p_updates) as input(value)
      on pv.id = (input.value->>'variant_id')::uuid
    order by pv.id
    for update of pv
  loop
    null;
  end loop;

  for v_update in
    select value
    from jsonb_array_elements(p_updates) as input(value)
    order by (value->>'variant_id')::uuid
  loop
    v_quantity := (v_update->>'brand_stock_quantity')::integer;
    if v_quantity is null or v_quantity < 0 then
      raise exception 'INVALID_BRAND_STOCK_QUANTITY';
    end if;

    select coalesce(sum(wti.requested_qty), 0) into v_pending
    from public.warehouse_transfer_items wti
    join public.warehouse_transfers wt on wt.id = wti.transfer_id
    where wti.variant_id = (v_update->>'variant_id')::uuid
      and wt.status = 'pending'
      and wt.direction = 'to_local';
    if v_quantity < v_pending then
      raise exception 'BRAND_STOCK_BELOW_PENDING_TRANSFERS';
    end if;

    update public.product_variants
    set brand_stock_quantity = v_quantity, updated_at = now()
    where id = (v_update->>'variant_id')::uuid;
  end loop;

  return true;
end;
$$;

revoke all on function private.receive_warehouse_transfer_canonical(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated, service_role;

revoke all on function public.request_warehouse_return(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.request_warehouse_return(uuid, uuid, jsonb, text, text)
  to service_role;

revoke all on function public.request_warehouse_transfer(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.request_warehouse_transfer(uuid, uuid, jsonb, text, text)
  to service_role;

revoke all on function public.receive_warehouse_return(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.receive_warehouse_return(uuid, uuid, jsonb, text)
  to service_role;

revoke all on function public.receive_warehouse_transfer(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.receive_warehouse_transfer(uuid, uuid, jsonb, text)
  to service_role;

revoke all on function public.reject_warehouse_transfer(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reject_warehouse_transfer(uuid, uuid, text)
  to service_role;

revoke all on function public.set_warehouse_brand_stock(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_warehouse_brand_stock(uuid, uuid, jsonb)
  to service_role;

-- All review and document mutations already go through authenticated server
-- routes using service_role. Removing direct client writes prevents bypassing
-- eligibility, rate limits, file-signature checks, and moderation boundaries.
revoke insert, update, delete on public.reviews from authenticated;
revoke insert, update, delete on public.review_images from authenticated;

-- The SKU counter is internal mutable state, not catalog data. Keep it out
-- of the Data API even on projects that still apply broad default grants.
alter table public.brand_sku_counters enable row level security;
revoke all on public.brand_sku_counters from public, anon, authenticated;
grant select, insert, update on public.brand_sku_counters to service_role;
revoke all on function public.next_product_sku(uuid) from public, anon, authenticated;
grant execute on function public.next_product_sku(uuid) to service_role;

drop policy if exists "Review authors upload review images" on storage.objects;
drop policy if exists "Review authors delete review images" on storage.objects;
drop policy if exists "Applicants can upload their own application documents" on storage.objects;

-- Reconcile bucket configuration deterministically. Public review/catalog
-- media stay public by design; legal application documents are always private.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'review-images', 'review-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'brand-application-documents', 'brand-application-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'product-images', 'product-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
