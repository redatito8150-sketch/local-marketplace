-- Order fulfillment and payment are separate state machines. A card payment
-- can be paid while fulfillment is merely confirmed; COD remains unpaid until
-- delivery. Keep one fulfillment vocabulary across customer, brand and admin.

create or replace function private.normalize_order_fulfillment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('pending', 'paid') then
    new.status := 'confirmed';
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_order_fulfillment_status on public.orders;
create trigger normalize_order_fulfillment_status
before insert or update of status on public.orders
for each row execute function private.normalize_order_fulfillment_status();

drop trigger if exists normalize_order_history_fulfillment_status on public.order_status_history;
create trigger normalize_order_history_fulfillment_status
before insert or update of status on public.order_status_history
for each row execute function private.normalize_order_fulfillment_status();

revoke all on function private.normalize_order_fulfillment_status()
  from public, anon, authenticated;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders alter column status set default 'confirmed';

update public.orders
set status = 'confirmed'
where status in ('pending', 'paid');

update public.order_status_history
set status = 'confirmed'
where status in ('pending', 'paid');

alter table public.orders add constraint orders_status_check
  check (status in (
    'confirmed', 'preparing', 'ready_for_pickup', 'shipped', 'fulfilled', 'cancelled'
  ));

create index if not exists idx_orders_brand_action_queue
  on public.orders (brand_slug, status, created_at)
  where fulfillment_type = 'brand_direct'
    and status in ('confirmed', 'preparing');

comment on column public.orders.status is
  'Fulfillment only: confirmed, preparing, ready_for_pickup, shipped, fulfilled, cancelled. Payment lives in payment_status.';

create or replace function public.transition_order_status(
  p_order_id uuid,
  p_expected_status text,
  p_new_status text,
  p_actor_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status text;
  v_payment_method text;
  v_payment_status text;
  v_allowed boolean := false;
begin
  select status, payment_method, payment_status
  into v_current_status, v_payment_method, v_payment_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_current_status <> p_expected_status then
    raise exception 'ORDER_STATUS_CONFLICT: current status is %', v_current_status;
  end if;
  if p_new_status = 'cancelled' then raise exception 'USE_CANCEL_ORDER'; end if;

  v_allowed :=
    (v_current_status = 'confirmed' and p_new_status = 'preparing')
    or (v_current_status = 'preparing' and p_new_status = 'ready_for_pickup')
    or (v_current_status = 'ready_for_pickup' and p_new_status = 'shipped')
    or (v_current_status = 'shipped' and p_new_status = 'fulfilled');

  if not v_allowed then
    raise exception 'INVALID_ORDER_TRANSITION: % -> %', v_current_status, p_new_status;
  end if;

  update public.orders
  set status = p_new_status,
      payment_status = case
        when p_new_status = 'fulfilled' and v_payment_method = 'cash_on_delivery' then 'paid'
        else payment_status
      end,
      payment_collected_at = case
        when p_new_status = 'fulfilled' and v_payment_method = 'cash_on_delivery' then now()
        else payment_collected_at
      end,
      payment_collected_by = case
        when p_new_status = 'fulfilled' and v_payment_method = 'cash_on_delivery' then p_actor_id
        else payment_collected_by
      end,
      payment_collection_source = case
        when p_new_status = 'fulfilled' and v_payment_method = 'cash_on_delivery' then 'delivery_confirmation'
        else payment_collection_source
      end
  where id = p_order_id;

  insert into public.order_status_history (order_id, status, note, created_by)
  values (p_order_id, p_new_status, nullif(btrim(p_note), ''), p_actor_id);

  return jsonb_build_object(
    'order_id', p_order_id,
    'previous_status', v_current_status,
    'status', p_new_status,
    'payment_status', case
      when p_new_status = 'fulfilled' and v_payment_method = 'cash_on_delivery' then 'paid'
      else v_payment_status
    end
  );
end;
$$;

revoke all on function public.transition_order_status(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.transition_order_status(uuid, text, text, uuid, text)
  to service_role;

-- Brand cancellation stays behind the authenticated portal route. It validates
-- the brand/order boundary, restores stock through cancel_order(), then attaches
-- the mandatory reason and actor to the same append-only status event.
create or replace function public.cancel_brand_order(
  p_order_id uuid,
  p_expected_status text,
  p_brand_slug text,
  p_actor_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_master_order_id uuid;
  v_result jsonb;
begin
  select master_order_id into v_master_order_id
  from public.orders
  where id = p_order_id;
  if not found or v_master_order_id is null then raise exception 'ORDER_NOT_FOUND'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_master_order_id::text, 0)
  );

  select status, fulfillment_type, brand_slug
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> p_expected_status then raise exception 'ORDER_STATUS_CONFLICT'; end if;
  if v_order.fulfillment_type <> 'brand_direct' or v_order.brand_slug is distinct from p_brand_slug then
    raise exception 'BRAND_ORDER_MISMATCH';
  end if;
  if v_order.status not in ('confirmed', 'preparing') then
    raise exception 'ORDER_CAN_NO_LONGER_BE_CANCELLED';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 or length(btrim(p_reason)) > 500 then
    raise exception 'INVALID_CANCELLATION_REASON';
  end if;

  v_result := public.cancel_order(p_order_id);

  update public.order_status_history
  set note = btrim(p_reason), created_by = p_actor_id
  where id = (
    select id
    from public.order_status_history
    where order_id = p_order_id and status = 'cancelled'
    order by created_at desc, id desc
    limit 1
  );

  return v_result || jsonb_build_object('reason', btrim(p_reason));
end;
$$;

revoke all on function public.cancel_brand_order(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_brand_order(uuid, text, text, uuid, text)
  to service_role;

create or replace function public.cancel_customer_master_order(
  p_master_order_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_order record;
  v_cancelled uuid[] := '{}';
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_master_order_id::text, 0)
  );

  select user_id into v_owner_id
  from public.master_orders
  where id = p_master_order_id
  for update;

  if not found then raise exception 'MASTER_ORDER_NOT_FOUND'; end if;
  if v_owner_id is distinct from p_user_id then raise exception 'ORDER_NOT_OWNED'; end if;

  perform 1 from public.orders where master_order_id = p_master_order_id for update;
  if not found then raise exception 'MASTER_ORDER_NOT_FOUND'; end if;
  if exists (
    select 1 from public.orders
    where master_order_id = p_master_order_id and user_id is distinct from p_user_id
  ) then raise exception 'ORDER_NOT_OWNED'; end if;
  if exists (
    select 1 from public.orders
    where master_order_id = p_master_order_id and payment_method <> 'cash_on_delivery'
  ) then raise exception 'CARD_ORDER_REQUIRES_REFUND_REVIEW'; end if;
  if exists (
    select 1 from public.orders
    where master_order_id = p_master_order_id
      and status not in ('confirmed', 'preparing', 'cancelled')
  ) then raise exception 'ORDER_CAN_NO_LONGER_BE_CANCELLED'; end if;
  if exists (
    select 1 from public.orders
    where master_order_id = p_master_order_id and payment_status <> 'unpaid'
  ) then raise exception 'PAID_ORDER_REQUIRES_REFUND_REVIEW'; end if;

  for v_order in
    select id from public.orders
    where master_order_id = p_master_order_id and status <> 'cancelled'
    order by id
  loop
    perform public.cancel_order(v_order.id);
    v_cancelled := array_append(v_cancelled, v_order.id);
  end loop;

  return jsonb_build_object(
    'master_order_id', p_master_order_id,
    'cancelled_order_ids', v_cancelled,
    'replayed', cardinality(v_cancelled) = 0
  );
end;
$$;

revoke all on function public.cancel_customer_master_order(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_customer_master_order(uuid, uuid)
  to service_role;
