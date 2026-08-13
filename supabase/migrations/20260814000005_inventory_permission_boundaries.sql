-- ============================================================================
-- Requirement 6 (inventory permissions) + requirement 7 (cutover safety),
-- enforced at the database level, not just the API layer:
--   - A zakhnook_fulfilled brand's own actors can never move
--     product_variants.quantity directly (neither via the brand-portal nor
--     the admin inventory-adjustments UI) — only a warehouse receipt or
--     apply_warehouse_stock_correction() may.
--   - While a brand has a non-terminal fulfillment transition open, no
--     direct adjustment is allowed at all (cutover safety).
--   - A variant cannot be archived while it still has stock anywhere, an
--     open warehouse document line, unresolved quarantine, or an open
--     order obligation.
-- ============================================================================

create or replace function public.apply_inventory_adjustments(
  p_brand_id uuid,
  p_actor_id uuid,
  p_adjustments jsonb,
  p_reason text,
  p_note text,
  p_source text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_variant record;
  v_type text;
  v_amount integer;
  v_new_quantity integer;
  v_delta integer;
  v_results jsonb := '[]'::jsonb;
  v_fulfillment_mode text;
  v_has_open_transition boolean;
begin
  if jsonb_typeof(p_adjustments) <> 'array'
     or jsonb_array_length(p_adjustments) = 0 then
    raise exception 'At least one inventory adjustment is required';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'An adjustment reason is required';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception 'An operation key is required';
  end if;

  select fulfillment_mode into v_fulfillment_mode from public.brands where id = p_brand_id;
  if v_fulfillment_mode is null then raise exception 'Brand not found'; end if;
  if v_fulfillment_mode = 'zakhnook_fulfilled' then
    raise exception 'PARTNER_DIRECT_ADJUSTMENT_FORBIDDEN: Zakhnook-held stock can only change via a warehouse receipt or an auditable warehouse correction';
  end if;

  select exists (
    select 1 from public.brand_fulfillment_transitions
    where brand_id = p_brand_id and status not in ('completed', 'cancelled', 'failed')
  ) into v_has_open_transition;
  if v_has_open_transition then
    raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS: inventory adjustments are paused during a fulfillment mode change';
  end if;

  for v_item in select * from jsonb_array_elements(p_adjustments)
  loop
    select pv.id, pv.product_id, pv.quantity, p.brand_id
      into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid
      and p.brand_id = p_brand_id
    for update of pv;

    if v_variant.id is null then
      raise exception 'Variant not found for this brand';
    end if;

    if exists (
      select 1 from public.inventory_movements
      where variant_id = v_variant.id
        and source_operation_key = p_operation_key
    ) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'variant_id', v_variant.id,
        'new_quantity', v_variant.quantity,
        'replayed', true
      ));
      continue;
    end if;

    v_type := v_item->>'type';
    v_amount := (v_item->>'amount')::integer;
    if v_amount is null or v_amount < 0 then
      raise exception 'Adjustment amount must be a non-negative integer';
    end if;

    if v_type = 'add' then
      v_new_quantity := v_variant.quantity + v_amount;
    elsif v_type = 'remove' then
      v_new_quantity := v_variant.quantity - v_amount;
    elsif v_type = 'set' then
      v_new_quantity := v_amount;
    else
      raise exception 'Invalid adjustment type';
    end if;
    if v_new_quantity < 0 then
      raise exception 'Inventory cannot become negative';
    end if;
    v_delta := v_new_quantity - v_variant.quantity;

    update public.product_variants
    set quantity = v_new_quantity, updated_at = now()
    where id = v_variant.id;

    insert into public.inventory_movements (
      variant_id, product_id, brand_id, previous_quantity, quantity_delta,
      new_quantity, movement_type, reason, note, created_by, source,
      source_operation_key, from_location, to_location, related_entity_type, related_entity_id
    ) values (
      v_variant.id, v_variant.product_id, p_brand_id, v_variant.quantity,
      v_delta, v_new_quantity,
      case when p_source = 'admin' then 'admin_correction' else 'manual_adjustment' end,
      p_reason, nullif(trim(p_note), ''), p_actor_id, p_source,
      p_operation_key,
      case when v_delta < 0 then 'brand_location' else null end,
      case when v_delta > 0 then 'brand_location' else 'sold_or_removed' end,
      'adjustment', v_variant.id
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant.id,
      'previous_quantity', v_variant.quantity,
      'quantity_delta', v_delta,
      'new_quantity', v_new_quantity,
      'replayed', false
    ));
  end loop;
  return v_results;
end;
$$;

revoke all on function public.apply_inventory_adjustments(
  uuid,uuid,jsonb,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.apply_inventory_adjustments(
  uuid,uuid,jsonb,text,text,text,text
) to service_role;

-- ============================================================================
-- Variant archive safety — a variant can never move from is_archived=false
-- to true while it still has stock anywhere, an open warehouse document
-- line, unresolved quarantine, or an open order obligation. This was
-- previously an app-layer-only check (lib/admin/variantPersistence.ts,
-- quantity > 0 only, not DB-enforced, not test-pinned) — this trigger adds
-- the missing defense-in-depth and the three additional conditions the
-- app layer never checked.
-- ============================================================================
create or replace function public.enforce_variant_archive_safety()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_open_orders integer;
  v_open_documents integer;
  v_unresolved_quarantine integer;
begin
  if tg_op <> 'UPDATE' or old.is_archived <> false or new.is_archived <> true then
    return new;
  end if;

  if new.quantity > 0 then
    raise exception 'VARIANT_ARCHIVE_BLOCKED_SELLABLE_STOCK';
  end if;
  if new.brand_stock_quantity > 0 then
    raise exception 'VARIANT_ARCHIVE_BLOCKED_DECLARED_BRAND_STOCK';
  end if;

  select count(*) into v_open_documents
  from public.warehouse_transfer_items wti
  join public.warehouse_transfers wt on wt.id = wti.transfer_id
  where wti.variant_id = new.id
    and wt.status not in ('received', 'rejected', 'cancelled');
  if v_open_documents > 0 then
    raise exception 'VARIANT_ARCHIVE_BLOCKED_OPEN_WAREHOUSE_DOCUMENT';
  end if;

  select count(*) into v_unresolved_quarantine
  from public.warehouse_transfer_items
  where variant_id = new.id and (coalesce(damaged_qty, 0) > 0 or coalesce(missing_qty, 0) > 0);
  if v_unresolved_quarantine > 0 then
    raise exception 'VARIANT_ARCHIVE_BLOCKED_UNRESOLVED_QUARANTINE';
  end if;

  select count(*) into v_open_orders
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.variant_id = new.id and o.status not in ('fulfilled', 'cancelled');
  if v_open_orders > 0 then
    raise exception 'VARIANT_ARCHIVE_BLOCKED_OPEN_ORDER';
  end if;

  return new;
end;
$$;

drop trigger if exists product_variants_enforce_archive_safety on public.product_variants;
create trigger product_variants_enforce_archive_safety
before update on public.product_variants
for each row execute function public.enforce_variant_archive_safety();

-- set_warehouse_brand_stock gains the same cutover-safety guard as
-- apply_inventory_adjustments — during an open fulfillment transition, a
-- brand's declared stock is already being reconciled by the transition RPCs
-- themselves (see 20260814000002_fulfillment_mode.sql), so an ordinary
-- self-service edit here would race against that reconciliation. Same
-- signature as the current version (20260810000006) — additive body change.
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
  v_has_open_transition boolean;
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

  select exists (
    select 1 from public.brand_fulfillment_transitions
    where brand_id = p_brand_id and status not in ('completed', 'cancelled', 'failed')
  ) into v_has_open_transition;
  if v_has_open_transition then
    raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS: declared stock is paused during a fulfillment mode change';
  end if;

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

revoke all on function public.set_warehouse_brand_stock(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_warehouse_brand_stock(uuid, uuid, jsonb) to service_role;

-- brand_stock_quantity / set_warehouse_brand_stock — deprecated, not
-- removed. Kept fully functional (Codex's concurrent Brand Portal
-- Inventory UI may already call it) while new development is pointed at
-- the ledger-backed "declare a shipment" flow (request_warehouse_transfer)
-- instead. See this branch's final report for the open decision on when to
-- fully retire it.
comment on column public.product_variants.brand_stock_quantity is
  'DEPRECATED (kept functional for backward compatibility) — a partner brand''s own declared "stock ready to ship" count, only ever moved by request_warehouse_transfer/receive. Never read by checkout/storefront. Prefer the warehouse-document flow (request_warehouse_transfer) for new development; do not build new features that treat this as an arbitrarily-editable total.';
comment on function public.set_warehouse_brand_stock(uuid, uuid, jsonb) is
  'DEPRECATED (kept functional for backward compatibility) — lets a partner brand freely overwrite its own declared brand_stock_quantity. Prefer request_warehouse_transfer (declare what is actually being shipped) for new development.';
