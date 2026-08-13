-- ============================================================================
-- Product launch state — the minimum safe backend addition to distinguish
-- "catalog-approved but never stocked" from "launched" from "launched, now
-- out of stock", without a stored 3-value enum that could drift from
-- reality. One nullable timestamp: products.first_stocked_at. Set once,
-- automatically, the first time real stock lands on any of a product's
-- variants — never cleared afterward, so a later stockout never hides the
-- product again. brand_fulfilled products get it immediately (their
-- opening stock is entered directly at creation), so this is invisible to
-- them; zakhnook_fulfilled products only get it once Zakhnook's warehouse
-- confirms the first accepted receipt.
-- ============================================================================

alter table public.products add column if not exists first_stocked_at timestamptz;
create index if not exists products_first_stocked_at_idx on public.products (first_stocked_at);

-- Backfill (item 5): the launch gate below only excludes zakhnook_fulfilled
-- products, so this only needs to run for those brands — a
-- zakhnook_fulfilled product that already has legitimate stock (currently
-- sellable, OR historically received a warehouse_transfer_received
-- movement even if since sold through to 0) must not vanish from the
-- storefront the moment this gate goes live. Uses the earliest qualifying
-- evidence as the stamped date (first receipt if any movement history
-- exists, else now() for the rare case of live stock with no matching
-- movement row) — never a fabricated/guessed date, and never re-run
-- destructively (only ever sets a currently-null column, `coalesce`-guarded).
update public.products p
set first_stocked_at = coalesce(
  (
    select min(im.created_at)
    from public.inventory_movements im
    where im.product_id = p.id and im.movement_type = 'warehouse_transfer_received'
  ),
  now()
)
from public.brands b
where b.id = p.brand_id
  and b.fulfillment_mode = 'zakhnook_fulfilled'
  and p.first_stocked_at is null
  and (
    exists (
      select 1 from public.inventory_movements im
      where im.product_id = p.id and im.movement_type = 'warehouse_transfer_received'
    )
    or exists (
      select 1 from public.product_variants pv
      where pv.product_id = p.id and pv.is_archived = false and pv.quantity > 0
    )
  );

-- Same signature as the current version (20260809000001) — purely additive
-- body change.
create or replace function public.create_variant_with_opening_stock(
  p_product_id text,
  p_sku text,
  p_combo_key text,
  p_opening_stock integer,
  p_variant_price numeric,
  p_variant_discount_percent numeric,
  p_low_stock_threshold_override integer,
  p_selling_status text,
  p_option_value_ids uuid[],
  p_actor_id uuid,
  p_operation_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_variant_id uuid;
  v_brand_id uuid;
begin
  if p_opening_stock < 0 then
    raise exception 'Opening Stock cannot be negative';
  end if;

  select brand_id into v_brand_id
  from public.products where id = p_product_id for update;
  if v_brand_id is null then raise exception 'Product not found'; end if;

  select id into v_variant_id
  from public.product_variants
  where product_id = p_product_id and combo_key = p_combo_key
  order by is_archived asc, created_at asc
  limit 1;

  if v_variant_id is not null then
    return v_variant_id;
  end if;

  insert into public.product_variants (
    product_id, sku, quantity, variant_price, variant_discount_percent,
    low_stock_threshold_override, selling_status, combo_key
  ) values (
    p_product_id, p_sku, p_opening_stock, p_variant_price, p_variant_discount_percent,
    p_low_stock_threshold_override, p_selling_status, p_combo_key
  ) returning id into v_variant_id;

  if coalesce(array_length(p_option_value_ids, 1), 0) > 0 then
    insert into public.product_variant_values (variant_id, option_value_id)
    select v_variant_id, unnest(p_option_value_ids);
  end if;

  insert into public.inventory_movements (
    variant_id, product_id, brand_id, previous_quantity, quantity_delta,
    new_quantity, movement_type, reason, created_by, source,
    source_operation_key
  ) values (
    v_variant_id, p_product_id, v_brand_id, 0, p_opening_stock,
    p_opening_stock, 'opening_balance', 'Opening Stock', p_actor_id,
    'product_editor', p_operation_key
  ) on conflict (variant_id, source_operation_key) do nothing;

  if p_opening_stock > 0 then
    update public.products
    set first_stocked_at = coalesce(first_stocked_at, now())
    where id = p_product_id;
  end if;

  return v_variant_id;
end;
$$;

revoke all on function public.create_variant_with_opening_stock(
  text,text,text,integer,numeric,numeric,integer,text,uuid[],uuid,text
) from public, anon, authenticated;
grant execute on function public.create_variant_with_opening_stock(
  text,text,text,integer,numeric,numeric,integer,text,uuid[],uuid,text
) to service_role;

-- The other half: a zakhnook_fulfilled product's first accepted receipt
-- also stamps first_stocked_at, so the storefront filter below can treat
-- "launched" identically regardless of which fulfillment mode got it there.
create or replace function private.mark_product_first_stocked(p_product_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.products set first_stocked_at = coalesce(first_stocked_at, now()) where id = p_product_id;
$$;

revoke all on function private.mark_product_first_stocked(text) from public, anon, authenticated, service_role;

-- Re-declares private.receive_warehouse_document_canonical (created in
-- 20260814000003_warehouse_documents.sql) with exactly one addition: a
-- 'to_local' receipt with received_ok_qty > 0 stamps first_stocked_at on
-- the product — the moment a zakhnook_fulfilled product becomes launched.
-- Body is otherwise byte-identical to the version in that migration.
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

    if p_expected_direction = 'to_local' and v_ok > 0 then
      perform private.mark_product_first_stocked(v_variant.product_id);
    end if;

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

    if v_damaged > 0 or v_missing > 0 then
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

revoke all on function private.receive_warehouse_document_canonical(uuid, uuid, jsonb, text, text)
  from public, anon, authenticated, service_role;
