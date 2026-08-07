-- Two independent cleanups:
-- 1. Local Warehouse gets a return path (Mahaly's warehouse -> back to the
--    brand), symmetric to the existing forward transfer. Same two tables,
--    a new `direction` column distinguishes them, so history stays unified
--    and the admin/brand-portal UIs can reuse the same list/detail pattern.
-- 2. The Instant-Publish Approve/Revert workflow is retired — every
--    existing 'pending' notification is normalized to 'n/a' so no stale
--    row keeps showing resolve controls that no longer exist in the UI.

alter table public.warehouse_transfers
  add column if not exists direction text not null default 'to_local'
    check (direction in ('to_local', 'to_brand'));

update public.notifications set resolution = 'n/a' where resolution = 'pending';

-- A brand requests its own already-received local-warehouse stock back —
-- validates the brand is a partner, every variant belongs to it, and the
-- requested amount doesn't exceed what's actually sellable right now
-- (product_variants.quantity) once other open return requests for that
-- same variant are accounted for.
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
set search_path = public, pg_temp
as $$
declare
  v_is_partner boolean;
  v_existing_id uuid;
  v_transfer_id uuid;
  v_item jsonb;
  v_variant record;
  v_requested integer;
  v_already_pending integer;
begin
  if nullif(trim(p_operation_key), '') is null then
    raise exception 'An operation key is required';
  end if;

  select id into v_existing_id from public.warehouse_transfers where operation_key = p_operation_key;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select is_mahaly_partner into v_is_partner from public.brands where id = p_brand_id for update;
  if v_is_partner is null then
    raise exception 'Brand not found';
  end if;
  if not v_is_partner then
    raise exception 'Only Mahaly Partner brands can request a warehouse return';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required';
  end if;

  insert into public.warehouse_transfers (brand_id, requested_by, brand_note, operation_key, direction)
  values (p_brand_id, p_actor_id, nullif(trim(p_note), ''), p_operation_key, 'to_brand')
  returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_requested := (v_item->>'requested_qty')::integer;
    if v_requested is null or v_requested <= 0 then
      raise exception 'Requested quantity must be a positive integer';
    end if;

    select pv.id, pv.quantity into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid and p.brand_id = p_brand_id
    for update of pv;

    if v_variant.id is null then
      raise exception 'Variant not found for this brand';
    end if;

    select coalesce(sum(wti.requested_qty), 0) into v_already_pending
    from public.warehouse_transfer_items wti
    join public.warehouse_transfers wt on wt.id = wti.transfer_id
    where wti.variant_id = v_variant.id and wt.status = 'pending' and wt.direction = 'to_brand';

    if v_requested > (v_variant.quantity - v_already_pending) then
      raise exception 'Requested quantity exceeds what is currently sellable for this variant';
    end if;

    insert into public.warehouse_transfer_items (transfer_id, variant_id, requested_qty, item_note)
    values (v_transfer_id, v_variant.id, v_requested, nullif(trim(v_item->>'item_note'), ''));
  end loop;

  return v_transfer_id;
end;
$$;

-- Mahaly's warehouse staff (or admin) confirms the return actually left
-- the warehouse: sellable stock always drops by received_ok+damaged+missing
-- (none of it is sellable from Mahaly anymore either way), but only the
-- genuinely good units (received_ok) credit the brand's own declared count
-- back — damaged/missing are a real loss, not silently returned as if fine.
create or replace function public.receive_warehouse_return(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer record;
  v_item jsonb;
  v_item_row record;
  v_variant record;
  v_ok integer;
  v_damaged integer;
  v_missing integer;
  v_new_quantity integer;
  v_new_brand_stock integer;
  v_results jsonb := '[]'::jsonb;
begin
  select id, brand_id, status, direction into v_transfer from public.warehouse_transfers where id = p_transfer_id for update;
  if v_transfer.id is null then
    raise exception 'Transfer not found';
  end if;
  if v_transfer.direction <> 'to_brand' then
    raise exception 'Not a return transfer';
  end if;
  if v_transfer.status <> 'pending' then
    raise exception 'Transfer has already been decided';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, variant_id, requested_qty into v_item_row
    from public.warehouse_transfer_items
    where id = (v_item->>'item_id')::uuid and transfer_id = p_transfer_id;
    if v_item_row.id is null then
      raise exception 'Transfer item not found on this transfer';
    end if;

    v_ok := coalesce((v_item->>'received_ok_qty')::integer, 0);
    v_damaged := coalesce((v_item->>'damaged_qty')::integer, 0);
    v_missing := coalesce((v_item->>'missing_qty')::integer, 0);
    if v_ok < 0 or v_damaged < 0 or v_missing < 0 then
      raise exception 'Received/damaged/missing counts cannot be negative';
    end if;
    if v_ok + v_damaged + v_missing <> v_item_row.requested_qty then
      raise exception 'Received + damaged + missing must equal the requested quantity for every item';
    end if;

    select id, quantity, product_id, brand_stock_quantity into v_variant
    from public.product_variants where id = v_item_row.variant_id for update;

    v_new_quantity := greatest(0, v_variant.quantity - (v_ok + v_damaged + v_missing));
    v_new_brand_stock := v_variant.brand_stock_quantity + v_ok;

    update public.product_variants
    set quantity = v_new_quantity, brand_stock_quantity = v_new_brand_stock, updated_at = now()
    where id = v_variant.id;

    if (v_ok + v_damaged + v_missing) > 0 then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id, v_variant.quantity,
        v_new_quantity - v_variant.quantity, v_new_quantity, 'warehouse_transfer_received',
        'Local Warehouse Return', nullif(trim(v_item->>'item_note'), ''), p_actor_id,
        'warehouse_transfer', 'warehouse-return:' || p_transfer_id::text || ':' || v_item_row.id::text
      ) on conflict (variant_id, source_operation_key) do nothing;
    end if;

    update public.warehouse_transfer_items
    set received_ok_qty = v_ok, damaged_qty = v_damaged, missing_qty = v_missing,
        item_note = coalesce(nullif(trim(v_item->>'item_note'), ''), item_note)
    where id = v_item_row.id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant.id, 'received_ok_qty', v_ok, 'damaged_qty', v_damaged,
      'missing_qty', v_missing, 'new_quantity', v_new_quantity
    ));
  end loop;

  update public.warehouse_transfers
  set status = 'received', decided_by = p_actor_id, decided_at = now(),
      receiving_note = nullif(trim(p_note), ''), updated_at = now()
  where id = p_transfer_id;

  return v_results;
end;
$$;

revoke all on function public.request_warehouse_return(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.request_warehouse_return(uuid, uuid, jsonb, text, text) to service_role;

revoke all on function public.receive_warehouse_return(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.receive_warehouse_return(uuid, uuid, jsonb, text) to service_role;

-- Defense in depth: the original forward-transfer receiver now also
-- refuses to touch a 'to_brand' row, even though only trusted server code
-- ever calls either function — belt and suspenders now that both
-- directions share one table.
create or replace function public.receive_warehouse_transfer(
  p_transfer_id uuid,
  p_actor_id uuid,
  p_items jsonb,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transfer record;
  v_item jsonb;
  v_item_row record;
  v_variant record;
  v_ok integer;
  v_damaged integer;
  v_missing integer;
  v_new_quantity integer;
  v_new_brand_stock integer;
  v_results jsonb := '[]'::jsonb;
begin
  select id, brand_id, status, direction into v_transfer from public.warehouse_transfers where id = p_transfer_id for update;
  if v_transfer.id is null then
    raise exception 'Transfer not found';
  end if;
  if v_transfer.direction <> 'to_local' then
    raise exception 'Not a forward transfer';
  end if;
  if v_transfer.status <> 'pending' then
    raise exception 'Transfer has already been decided';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select id, variant_id, requested_qty into v_item_row
    from public.warehouse_transfer_items
    where id = (v_item->>'item_id')::uuid and transfer_id = p_transfer_id;
    if v_item_row.id is null then
      raise exception 'Transfer item not found on this transfer';
    end if;

    v_ok := coalesce((v_item->>'received_ok_qty')::integer, 0);
    v_damaged := coalesce((v_item->>'damaged_qty')::integer, 0);
    v_missing := coalesce((v_item->>'missing_qty')::integer, 0);
    if v_ok < 0 or v_damaged < 0 or v_missing < 0 then
      raise exception 'Received/damaged/missing counts cannot be negative';
    end if;
    if v_ok + v_damaged + v_missing <> v_item_row.requested_qty then
      raise exception 'Received + damaged + missing must equal the requested quantity for every item';
    end if;

    select id, quantity, product_id, brand_stock_quantity into v_variant
    from public.product_variants where id = v_item_row.variant_id for update;

    v_new_quantity := v_variant.quantity + v_ok;
    v_new_brand_stock := greatest(0, v_variant.brand_stock_quantity - v_item_row.requested_qty);

    update public.product_variants
    set quantity = v_new_quantity, brand_stock_quantity = v_new_brand_stock, updated_at = now()
    where id = v_variant.id;

    if v_ok > 0 then
      insert into public.inventory_movements (
        variant_id, product_id, brand_id, previous_quantity, quantity_delta,
        new_quantity, movement_type, reason, note, created_by, source,
        source_operation_key
      ) values (
        v_variant.id, v_variant.product_id, v_transfer.brand_id, v_variant.quantity,
        v_ok, v_new_quantity, 'warehouse_transfer_received', 'Local Warehouse Transfer Received',
        nullif(trim(v_item->>'item_note'), ''), p_actor_id, 'warehouse_transfer',
        'warehouse-transfer:' || p_transfer_id::text || ':' || v_item_row.id::text
      ) on conflict (variant_id, source_operation_key) do nothing;
    end if;

    update public.warehouse_transfer_items
    set received_ok_qty = v_ok, damaged_qty = v_damaged, missing_qty = v_missing,
        item_note = coalesce(nullif(trim(v_item->>'item_note'), ''), item_note)
    where id = v_item_row.id;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant.id, 'received_ok_qty', v_ok, 'damaged_qty', v_damaged,
      'missing_qty', v_missing, 'new_quantity', v_new_quantity
    ));
  end loop;

  update public.warehouse_transfers
  set status = 'received', decided_by = p_actor_id, decided_at = now(),
      receiving_note = nullif(trim(p_note), ''), updated_at = now()
  where id = p_transfer_id;

  return v_results;
end;
$$;

-- Correctness fix: the original request_warehouse_transfer's "how much is
-- already spoken for" check summed every pending item for a variant
-- regardless of direction — now that a return request can also be pending
-- against the same variant, that would wrongly shrink how much a brand can
-- still request forward. Re-scoped to direction = 'to_local' only.
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
set search_path = public, pg_temp
as $$
declare
  v_is_partner boolean;
  v_existing_id uuid;
  v_transfer_id uuid;
  v_item jsonb;
  v_variant record;
  v_requested integer;
  v_already_pending integer;
begin
  if nullif(trim(p_operation_key), '') is null then
    raise exception 'An operation key is required';
  end if;

  select id into v_existing_id from public.warehouse_transfers where operation_key = p_operation_key;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  select is_mahaly_partner into v_is_partner from public.brands where id = p_brand_id for update;
  if v_is_partner is null then
    raise exception 'Brand not found';
  end if;
  if not v_is_partner then
    raise exception 'Only Mahaly Partner brands can request a warehouse transfer';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required';
  end if;

  insert into public.warehouse_transfers (brand_id, requested_by, brand_note, operation_key, direction)
  values (p_brand_id, p_actor_id, nullif(trim(p_note), ''), p_operation_key, 'to_local')
  returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_requested := (v_item->>'requested_qty')::integer;
    if v_requested is null or v_requested <= 0 then
      raise exception 'Requested quantity must be a positive integer';
    end if;

    select pv.id, pv.brand_stock_quantity into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid and p.brand_id = p_brand_id
    for update of pv;

    if v_variant.id is null then
      raise exception 'Variant not found for this brand';
    end if;

    select coalesce(sum(wti.requested_qty), 0) into v_already_pending
    from public.warehouse_transfer_items wti
    join public.warehouse_transfers wt on wt.id = wti.transfer_id
    where wti.variant_id = v_variant.id and wt.status = 'pending' and wt.direction = 'to_local';

    if v_requested > (v_variant.brand_stock_quantity - v_already_pending) then
      raise exception 'Requested quantity exceeds your declared stock for this variant';
    end if;

    insert into public.warehouse_transfer_items (transfer_id, variant_id, requested_qty, unit_cost, item_note)
    values (
      v_transfer_id, v_variant.id, v_requested,
      nullif(v_item->>'unit_cost', '')::numeric,
      nullif(trim(v_item->>'item_note'), '')
    );
  end loop;

  return v_transfer_id;
end;
$$;
