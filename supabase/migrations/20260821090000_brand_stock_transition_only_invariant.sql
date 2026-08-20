-- brand_stock_quantity is a fulfillment-cutover snapshot, not a second
-- inventory balance for ordinary partner operations.
--
-- The document-first replenishment migration stopped ordinary inbound
-- receipts from consuming this deprecated field, but the ordinary outbound
-- return branch still added returned units to it. That left products with
-- zero Zakhnook stock blocked from Archive by a synthetic "brand-held"
-- balance even though the immutable warehouse document already recorded the
-- return. The same stale field could also still be written through the old
-- service-role setter.
--
-- This migration establishes one canonical invariant:
--   brand_stock_quantity may be non-zero only while the owning brand has an
--   open fulfillment-mode transition.
-- Ordinary returns remain fully auditable through warehouse_transfers,
-- warehouse_transfer_items, and inventory_movements (whose location is
-- returned_to_brand); they no longer create a second current balance.

create table if not exists public.brand_stock_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete restrict,
  product_id text references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  previous_quantity integer not null check (previous_quantity >= 0),
  attempted_quantity integer not null check (attempted_quantity >= 0),
  new_quantity integer not null check (new_quantity >= 0),
  reason text not null,
  source text not null,
  created_at timestamptz not null default now()
);

create index if not exists brand_stock_reconciliation_events_brand_created_idx
  on public.brand_stock_reconciliation_events (brand_id, created_at desc);
create index if not exists brand_stock_reconciliation_events_product_created_idx
  on public.brand_stock_reconciliation_events (product_id, created_at desc)
  where product_id is not null;

alter table public.brand_stock_reconciliation_events enable row level security;

drop policy if exists "Brand members can read brand stock reconciliation events"
  on public.brand_stock_reconciliation_events;
create policy "Brand members can read brand stock reconciliation events"
on public.brand_stock_reconciliation_events for select to authenticated
using (
  exists (
    select 1 from public.brands b
    where b.id = brand_stock_reconciliation_events.brand_id
      and b.owner_user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.brand_staff bs
    where bs.brand_id = brand_stock_reconciliation_events.brand_id
      and bs.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin
  )
);

grant select on public.brand_stock_reconciliation_events to authenticated;
grant all on public.brand_stock_reconciliation_events to service_role;
revoke insert, update, delete on public.brand_stock_reconciliation_events
  from public, anon, authenticated;

create or replace function private.prevent_brand_stock_reconciliation_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Brand stock reconciliation history is immutable';
end;
$$;

revoke all on function private.prevent_brand_stock_reconciliation_event_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists brand_stock_reconciliation_events_immutable
  on public.brand_stock_reconciliation_events;
create trigger brand_stock_reconciliation_events_immutable
before update or delete on public.brand_stock_reconciliation_events
for each row execute function private.prevent_brand_stock_reconciliation_event_mutation();

-- Defense in depth for every present and future write path. Fulfillment RPCs
-- insert the transition row before moving the cutover snapshot, and keep that
-- row non-terminal until the snapshot is consumed or reverted, so their
-- legitimate writes pass unchanged. An ordinary return/correction has no
-- open transition and is normalized back to zero in the same transaction.
create or replace function private.enforce_transition_only_brand_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_brand_id uuid;
  v_has_open_transition boolean;
begin
  if new.brand_stock_quantity is not distinct from old.brand_stock_quantity then
    return new;
  end if;

  select p.brand_id into v_brand_id
  from public.products p
  where p.id = new.product_id;

  select exists (
    select 1
    from public.brand_fulfillment_transitions bft
    where bft.brand_id = v_brand_id
      and bft.status not in ('completed', 'cancelled', 'failed')
  ) into v_has_open_transition;

  if not coalesce(v_has_open_transition, false) then
    insert into public.brand_stock_reconciliation_events (
      brand_id, product_id, variant_id, previous_quantity,
      attempted_quantity, new_quantity, reason, source
    ) values (
      v_brand_id, new.product_id, new.id, old.brand_stock_quantity,
      new.brand_stock_quantity, 0,
      case
        when new.brand_stock_quantity = 0 then 'Cleared non-transition legacy balance'
        else 'Suppressed non-transition brand-stock write'
      end,
      case
        when pg_trigger_depth() > 1 then 'database_guard_nested'
        else 'database_guard'
      end
    );
    new.brand_stock_quantity := 0;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_transition_only_brand_stock()
  from public, anon, authenticated, service_role;

drop trigger if exists product_variants_transition_only_brand_stock
  on public.product_variants;
create trigger product_variants_transition_only_brand_stock
before update of brand_stock_quantity on public.product_variants
for each row execute function private.enforce_transition_only_brand_stock();

-- One-time repair. The trigger above records every prior value before
-- normalizing it. Brands with an open transition are deliberately excluded:
-- their balance is an active cutover snapshot and must remain untouched.
update public.product_variants pv
set brand_stock_quantity = 0,
    updated_at = now()
from public.products p
where p.id = pv.product_id
  and pv.brand_stock_quantity > 0
  and not exists (
    select 1
    from public.brand_fulfillment_transitions bft
    where bft.brand_id = p.brand_id
      and bft.status not in ('completed', 'cancelled', 'failed')
  );

-- The HTTP route has already been retired. Keep the database signature so a
-- stale caller gets a specific error instead of a missing-function failure,
-- but remove the last path that could claim a deprecated overwrite succeeded.
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
begin
  raise exception 'MANUAL_BRAND_STOCK_DISABLED: brand stock is managed only by fulfillment transitions';
end;
$$;

revoke all on function public.set_warehouse_brand_stock(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.set_warehouse_brand_stock(uuid, uuid, jsonb)
  to service_role;

comment on column public.product_variants.brand_stock_quantity is
  'Transition-only balance. May be non-zero only while the owning brand has an open fulfillment-mode transition. Ordinary replenishments, returns, corrections, checkout, and storefront availability must not read or write it as a current stock balance.';
comment on function public.set_warehouse_brand_stock(uuid, uuid, jsonb) is
  'Disabled compatibility signature. Manual brand-stock overwrites are forbidden; fulfillment transition RPCs are the only legitimate writers.';
comment on table public.brand_stock_reconciliation_events is
  'Immutable evidence of legacy or ordinary-workflow brand_stock_quantity writes normalized by the transition-only invariant.';
