-- ============================================================================
-- Location-aware stock ledger, built by EXTENDING the existing
-- inventory_movements table rather than standing up a second, largely
-- duplicate ledger. inventory_movements already has everything requirement
-- 3 of the fulfillment-foundation spec asks for except explicit
-- from/to location and a real related-entity pointer: it's already
-- immutable (trigger-enforced), already idempotent
-- (unique(variant_id, source_operation_key)), and already records variant,
-- brand, before/after balances, movement type, reason, actor, source, and
-- timestamp. Historical rows keep from_location/to_location/
-- related_entity_type/related_entity_id all null forever — never backfilled.
-- ============================================================================

alter table public.inventory_movements
  add column if not exists from_location text,
  add column if not exists to_location text,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id uuid;

alter table public.inventory_movements drop constraint if exists inventory_movements_from_location_check;
alter table public.inventory_movements add constraint inventory_movements_from_location_check
  check (from_location is null or from_location in (
    'brand_location', 'in_transit_to_zakhnook', 'zakhnook_available',
    'zakhnook_quarantine', 'returned_to_brand', 'sold_or_removed'
  ));

alter table public.inventory_movements drop constraint if exists inventory_movements_to_location_check;
alter table public.inventory_movements add constraint inventory_movements_to_location_check
  check (to_location is null or to_location in (
    'brand_location', 'in_transit_to_zakhnook', 'zakhnook_available',
    'zakhnook_quarantine', 'returned_to_brand', 'sold_or_removed'
  ));

alter table public.inventory_movements drop constraint if exists inventory_movements_related_entity_type_check;
alter table public.inventory_movements add constraint inventory_movements_related_entity_type_check
  check (related_entity_type is null or related_entity_type in (
    'order', 'warehouse_document', 'fulfillment_transition', 'adjustment', 'warehouse_correction'
  ));

create index if not exists inventory_movements_related_entity_idx
  on public.inventory_movements (related_entity_type, related_entity_id)
  where related_entity_type is not null;

-- Additive widening only — every existing value stays valid, historical
-- rows are untouched.
alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check check (movement_type in (
  'opening_balance', 'manual_adjustment', 'order_placed', 'order_cancelled',
  'return_restocked', 'admin_correction', 'legacy_opening_balance', 'import',
  'other', 'warehouse_transfer_received', 'warehouse_return_reserved',
  'warehouse_return_released', 'warehouse_transfer_shipped',
  'warehouse_quarantine_hold', 'warehouse_quarantine_release',
  'fulfillment_transition_snapshot'
));

-- ============================================================================
-- apply_warehouse_stock_correction — the ONE legitimate way to adjust
-- Zakhnook-held sellable stock (product_variants.quantity for a
-- zakhnook_fulfilled brand's variant) outside a warehouse receipt. Requires
-- a mandatory reason, always tagged movement_type = 'admin_correction' and
-- related_entity_type = 'warehouse_correction' so it's always distinguishable
-- from an ordinary brand-initiated adjustment in the ledger. Gated at the
-- route layer by requireWarehouseReceiver() (admin or manage_inventory
-- permission) — never callable by a brand-portal actor.
-- ============================================================================
create or replace function public.apply_warehouse_stock_correction(
  p_variant_id uuid,
  p_actor_id uuid,
  p_delta integer,
  p_reason text,
  p_note text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant record;
  v_new_quantity integer;
begin
  if p_delta = 0 then raise exception 'CORRECTION_DELTA_REQUIRED'; end if;
  if nullif(pg_catalog.btrim(p_reason), '') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  if nullif(pg_catalog.btrim(p_operation_key), '') is null or length(p_operation_key) > 160 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;

  select pv.id, pv.quantity, pv.product_id, p.brand_id into v_variant
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = p_variant_id
  for update of pv;
  if v_variant.id is null then raise exception 'VARIANT_NOT_FOUND'; end if;

  if exists (
    select 1 from public.inventory_movements
    where variant_id = v_variant.id and source_operation_key = p_operation_key
  ) then
    return jsonb_build_object('variant_id', v_variant.id, 'new_quantity', v_variant.quantity, 'replayed', true);
  end if;

  v_new_quantity := v_variant.quantity + p_delta;
  if v_new_quantity < 0 then raise exception 'CORRECTION_WOULD_GO_NEGATIVE'; end if;

  update public.product_variants
  set quantity = v_new_quantity, updated_at = now()
  where id = v_variant.id;

  insert into public.inventory_movements (
    variant_id, product_id, brand_id, previous_quantity, quantity_delta,
    new_quantity, movement_type, reason, note, created_by, source,
    source_operation_key, from_location, to_location,
    related_entity_type, related_entity_id
  ) values (
    v_variant.id, v_variant.product_id, v_variant.brand_id, v_variant.quantity,
    p_delta, v_new_quantity, 'admin_correction', p_reason,
    nullif(pg_catalog.btrim(p_note), ''), p_actor_id, 'warehouse_correction',
    p_operation_key,
    case when p_delta < 0 then 'zakhnook_available' else null end,
    case when p_delta > 0 then 'zakhnook_available' else 'sold_or_removed' end,
    'warehouse_correction', v_variant.id
  );

  return jsonb_build_object('variant_id', v_variant.id, 'previous_quantity', v_variant.quantity, 'new_quantity', v_new_quantity, 'replayed', false);
end;
$$;

revoke all on function public.apply_warehouse_stock_correction(uuid, uuid, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_warehouse_stock_correction(uuid, uuid, integer, text, text, text)
  to service_role;
