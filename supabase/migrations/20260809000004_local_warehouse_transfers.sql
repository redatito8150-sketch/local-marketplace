-- Local Warehouse (مخزن محلي): a consignment workflow for brands.brands
-- already has is_mahaly_partner (order-splitting/shipping-pool flag,
-- 20260807000001) — this migration reuses that exact flag as "this brand's
-- stock physically lives in Mahaly's warehouse", and adds the ledger that
-- was missing: a brand registers its own stock count, requests a transfer
-- ("اذن صرف مخزن"), and only once Mahaly's own staff confirms receipt
-- (with any damaged/missing counted) does product_variants.quantity — the
-- one column the storefront/checkout already reads — increase. Nothing
-- about checkout, place_order(), or isVariantPurchasable() changes: a
-- partner-brand variant's `quantity` still means exactly what it always
-- meant ("available to sell right now"), it just can no longer be
-- increased by the brand directly (see the apply_inventory_adjustments
-- restriction added in the brand-portal/admin inventory routes).

alter table public.product_variants
  add column if not exists brand_stock_quantity integer not null default 0
    check (brand_stock_quantity >= 0);

comment on column public.product_variants.brand_stock_quantity is
  'Informational only — the brand''s own declared count, not used by the storefront. Only decreases when a warehouse transfer is received; never read by checkout/isVariantPurchasable.';

-- Widen the immutable ledger's vocabulary so a received transfer gets its
-- own honest movement_type instead of being misfiled under an existing one.
alter table public.inventory_movements drop constraint if exists inventory_movements_movement_type_check;
alter table public.inventory_movements add constraint inventory_movements_movement_type_check check (movement_type in (
  'opening_balance', 'manual_adjustment', 'order_placed',
  'order_cancelled', 'return_restocked', 'admin_correction',
  'legacy_opening_balance', 'import', 'other', 'warehouse_transfer_received'
));

create table if not exists public.warehouse_transfers (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'received', 'rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  brand_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  receiving_note text,
  operation_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists warehouse_transfers_brand_status_idx
  on public.warehouse_transfers (brand_id, status, requested_at desc);

create table if not exists public.warehouse_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.warehouse_transfers(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  requested_qty integer not null check (requested_qty > 0),
  received_ok_qty integer,
  damaged_qty integer,
  missing_qty integer,
  unit_cost numeric(10, 2),
  item_note text,
  check (
    received_ok_qty is null
    or (received_ok_qty >= 0 and damaged_qty >= 0 and missing_qty >= 0
        and received_ok_qty + damaged_qty + missing_qty = requested_qty)
  )
);

create index if not exists warehouse_transfer_items_transfer_idx
  on public.warehouse_transfer_items (transfer_id);
create index if not exists warehouse_transfer_items_variant_idx
  on public.warehouse_transfer_items (variant_id);

alter table public.warehouse_transfers enable row level security;
alter table public.warehouse_transfer_items enable row level security;

-- Read-only for the people who need to see it; every write (request,
-- receive, reject) goes through the RPCs/routes below via service_role —
-- same "no public INSERT policies" convention as the rest of this project.
drop policy if exists "Brand members and staff can read their transfers" on public.warehouse_transfers;
create policy "Brand members and staff can read their transfers"
on public.warehouse_transfers for select to authenticated
using (
  exists (
    select 1 from public.brands b
    where b.id = warehouse_transfers.brand_id and b.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.brand_staff bs
    where bs.brand_id = warehouse_transfers.brand_id and bs.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin
  )
);

drop policy if exists "Brand members and staff can read their transfer items" on public.warehouse_transfer_items;
create policy "Brand members and staff can read their transfer items"
on public.warehouse_transfer_items for select to authenticated
using (
  exists (
    select 1 from public.warehouse_transfers wt
    join public.brands b on b.id = wt.brand_id
    where wt.id = warehouse_transfer_items.transfer_id
      and (
        b.owner_user_id = (select auth.uid())
        or exists (select 1 from public.brand_staff bs where bs.brand_id = b.id and bs.user_id = (select auth.uid()))
        or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin)
      )
  )
);

grant select on public.warehouse_transfers to authenticated;
grant select on public.warehouse_transfer_items to authenticated;
grant all on public.warehouse_transfers to service_role;
grant all on public.warehouse_transfer_items to service_role;
revoke insert, update, delete on public.warehouse_transfers from anon, authenticated;
revoke insert, update, delete on public.warehouse_transfer_items from anon, authenticated;

-- A brand requests a transfer: validates the brand is actually a Mahaly
-- partner, every variant belongs to it, and the requested amount doesn't
-- exceed what's left of brand_stock_quantity once already-open transfer
-- requests for that same variant are accounted for (so two concurrent
-- requests can't both draw down the same declared stock).
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

  insert into public.warehouse_transfers (brand_id, requested_by, brand_note, operation_key)
  values (p_brand_id, p_actor_id, nullif(trim(p_note), ''), p_operation_key)
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
    where wti.variant_id = v_variant.id and wt.status = 'pending';

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

-- Mahaly warehouse staff (or admin) confirms receipt: reconciles each line
-- (received_ok + damaged + missing must equal what was requested), lands
-- the good units on product_variants.quantity — the one column the
-- storefront already trusts — and writes the same immutable
-- inventory_movements ledger every other quantity change writes to.
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
  select id, brand_id, status into v_transfer from public.warehouse_transfers where id = p_transfer_id for update;
  if v_transfer.id is null then
    raise exception 'Transfer not found';
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

revoke all on function public.request_warehouse_transfer(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.request_warehouse_transfer(uuid, uuid, jsonb, text, text) to service_role;

revoke all on function public.receive_warehouse_transfer(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.receive_warehouse_transfer(uuid, uuid, jsonb, text) to service_role;
