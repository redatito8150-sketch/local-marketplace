-- One authoritative inventory balance (product_variants.quantity) with an
-- immutable movement ledger. All quantity writes happen inside the trusted
-- functions below so balance and history commit together.

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_id text not null references public.products(id) on delete restrict,
  brand_id uuid not null references public.brands(id) on delete restrict,
  previous_quantity integer not null check (previous_quantity >= 0),
  quantity_delta integer not null,
  new_quantity integer not null check (new_quantity >= 0),
  movement_type text not null check (movement_type in (
    'opening_balance', 'manual_adjustment', 'order_placed',
    'order_cancelled', 'return_restocked', 'admin_correction',
    'legacy_opening_balance', 'import', 'other'
  )),
  reason text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  source text not null,
  source_operation_key text not null,
  created_at timestamptz not null default now(),
  unique (variant_id, source_operation_key),
  check (new_quantity = previous_quantity + quantity_delta)
);

create index if not exists inventory_movements_brand_created_idx
  on public.inventory_movements (brand_id, created_at desc);
create index if not exists inventory_movements_product_created_idx
  on public.inventory_movements (product_id, created_at desc);
create index if not exists inventory_movements_variant_created_idx
  on public.inventory_movements (variant_id, created_at desc);

alter table public.inventory_movements enable row level security;

drop policy if exists "Brand members can read inventory movements" on public.inventory_movements;
create policy "Brand members can read inventory movements"
on public.inventory_movements for select to authenticated
using (
  exists (
    select 1 from public.brands b
    where b.id = inventory_movements.brand_id
      and b.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.brand_staff bs
    where bs.brand_id = inventory_movements.brand_id
      and bs.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  )
);

grant select on public.inventory_movements to authenticated;
grant all on public.inventory_movements to service_role;
revoke insert, update, delete on public.inventory_movements from anon, authenticated;

create or replace function public.prevent_inventory_movement_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Inventory history is immutable';
end;
$$;

drop trigger if exists inventory_movements_immutable on public.inventory_movements;
create trigger inventory_movements_immutable
before update or delete on public.inventory_movements
for each row execute function public.prevent_inventory_movement_mutation();

-- Existing balances are preserved. A deterministic key makes this backfill
-- safe to rerun and avoids duplicating any variant that already has history.
insert into public.inventory_movements (
  variant_id, product_id, brand_id, previous_quantity, quantity_delta,
  new_quantity, movement_type, reason, source, source_operation_key, created_at
)
select
  pv.id, pv.product_id, p.brand_id, 0, pv.quantity, pv.quantity,
  'legacy_opening_balance', 'Legacy Opening Balance', 'migration',
  'legacy-opening-balance-v1', pv.created_at
from public.product_variants pv
join public.products p on p.id = pv.product_id
where not exists (
  select 1 from public.inventory_movements im where im.variant_id = pv.id
)
on conflict (variant_id, source_operation_key) do nothing;

create or replace function public.create_variant_with_opening_stock(
  p_product_id text,
  p_sku text,
  p_combo_key text,
  p_opening_stock integer,
  p_variant_price numeric,
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
    product_id, sku, quantity, variant_price,
    low_stock_threshold_override, selling_status, combo_key
  ) values (
    p_product_id, p_sku, p_opening_stock, p_variant_price,
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

  return v_variant_id;
end;
$$;

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
      source_operation_key
    ) values (
      v_variant.id, v_variant.product_id, p_brand_id, v_variant.quantity,
      v_delta, v_new_quantity,
      case when p_source = 'admin' then 'admin_correction' else 'manual_adjustment' end,
      p_reason, nullif(trim(p_note), ''), p_actor_id, p_source,
      p_operation_key
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

revoke all on function public.create_variant_with_opening_stock(
  text,text,text,integer,numeric,integer,text,uuid[],uuid,text
) from public, anon, authenticated;
grant execute on function public.create_variant_with_opening_stock(
  text,text,text,integer,numeric,integer,text,uuid[],uuid,text
) to service_role;

revoke all on function public.apply_inventory_adjustments(
  uuid,uuid,jsonb,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.apply_inventory_adjustments(
  uuid,uuid,jsonb,text,text,text,text
) to service_role;

-- Retire the obsolete destructive product replacement RPC.
revoke all on function public.replace_product_with_variants(text,jsonb,jsonb)
from public, anon, authenticated;

-- place_order updates the locked balance before inserting order_items. The
-- item trigger records that already-committed-in-this-transaction delta.
create or replace function public.record_order_placed_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_brand_id uuid;
  v_current integer;
begin
  if new.variant_id is null then return new; end if;
  select pv.quantity, p.brand_id into v_current, v_brand_id
  from public.product_variants pv join public.products p on p.id = pv.product_id
  where pv.id = new.variant_id;
  insert into public.inventory_movements (
    variant_id, product_id, brand_id, previous_quantity, quantity_delta,
    new_quantity, movement_type, reason, source, source_operation_key
  ) values (
    new.variant_id, new.product_id, v_brand_id, v_current + new.quantity,
    -new.quantity, v_current, 'order_placed', 'Order Placed',
    'order', 'order:' || new.order_id::text || ':' || new.id::text
  ) on conflict (variant_id, source_operation_key) do nothing;
  return new;
end;
$$;

drop trigger if exists order_items_inventory_movement on public.order_items;
create trigger order_items_inventory_movement
after insert on public.order_items
for each row execute function public.record_order_placed_inventory_movement();

-- cancel_order restores every balance and only then changes the order status.
create or replace function public.record_order_cancelled_inventory_movements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
  v_brand_id uuid;
  v_current integer;
begin
  if old.status = 'cancelled' or new.status <> 'cancelled' then return new; end if;
  for v_item in
    select oi.id, oi.variant_id, oi.product_id, oi.quantity
    from public.order_items oi where oi.order_id = new.id and oi.variant_id is not null
  loop
    select pv.quantity, p.brand_id into v_current, v_brand_id
    from public.product_variants pv join public.products p on p.id = pv.product_id
    where pv.id = v_item.variant_id;
    insert into public.inventory_movements (
      variant_id, product_id, brand_id, previous_quantity, quantity_delta,
      new_quantity, movement_type, reason, source, source_operation_key
    ) values (
      v_item.variant_id, v_item.product_id, v_brand_id,
      v_current - v_item.quantity, v_item.quantity, v_current,
      'order_cancelled', 'Order Cancelled', 'order_cancellation',
      'cancel:' || new.id::text || ':' || v_item.id::text
    ) on conflict (variant_id, source_operation_key) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists orders_cancelled_inventory_movements on public.orders;
create trigger orders_cancelled_inventory_movements
after update of status on public.orders
for each row execute function public.record_order_cancelled_inventory_movements();

;
