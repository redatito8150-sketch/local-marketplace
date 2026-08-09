-- Durable order idempotency, financial constraints, symmetric coupon release,
-- and atomic state transitions. This migration intentionally keeps every
-- mutating RPC service_role-only.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.order_idempotency (
  actor_key text not null,
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_key, idempotency_key)
);
revoke all on private.order_idempotency from public, anon, authenticated;

create table if not exists private.coupon_redemptions (
  order_group_id uuid primary key,
  coupon_code text not null references public.coupons(code) on delete restrict,
  redeemed_at timestamptz not null default now(),
  released_at timestamptz
);
revoke all on private.coupon_redemptions from public, anon, authenticated;

insert into private.coupon_redemptions (
  order_group_id,
  coupon_code,
  redeemed_at,
  released_at
)
select
  order_group_id,
  max(coupon_code),
  min(created_at),
  case when bool_and(status = 'cancelled') then now() else null end
from public.orders
where coupon_code is not null
group by order_group_id
on conflict (order_group_id) do nothing;

-- NOT VALID avoids making deployment depend on unknown legacy corruption,
-- while PostgreSQL still enforces each constraint for every new/updated row.
alter table public.order_items drop constraint if exists order_items_quantity_positive;
alter table public.order_items add constraint order_items_quantity_positive
  check (quantity > 0) not valid;
alter table public.order_items drop constraint if exists order_items_price_nonnegative;
alter table public.order_items add constraint order_items_price_nonnegative
  check (price >= 0) not valid;
alter table public.order_items drop constraint if exists order_items_currency_valid;
alter table public.order_items add constraint order_items_currency_valid
  check (currency in ('USD', 'EGP')) not valid;

alter table public.orders drop constraint if exists orders_financial_amounts_nonnegative;
alter table public.orders add constraint orders_financial_amounts_nonnegative
  check (
    subtotal_usd >= 0
    and subtotal_egp >= 0
    and discount_amount_egp >= 0
    and shipping_fee_egp >= 0
  ) not valid;

alter table public.products drop constraint if exists products_price_nonnegative;
alter table public.products add constraint products_price_nonnegative
  check (price >= 0) not valid;

alter table public.coupons drop constraint if exists coupons_usage_counts_valid;
alter table public.coupons add constraint coupons_usage_counts_valid
  check (used_count >= 0 and (max_uses is null or max_uses > 0)) not valid;
alter table public.coupons drop constraint if exists coupons_discount_value_valid;
alter table public.coupons add constraint coupons_discount_value_valid
  check (
    discount_value > 0
    and (discount_type <> 'percentage' or discount_value <= 100)
  ) not valid;

-- The existing implementation remains the one authoritative transaction for
-- stock, coupon increment, splitting, and order rows, but is moved out of the
-- exposed schema so only the idempotent public wrapper can reach it.
revoke all on function public.place_order(text, text, text, text, text, text, uuid, jsonb, text, uuid, numeric, numeric)
  from public, anon, authenticated;
alter function public.place_order(text, text, text, text, text, text, uuid, jsonb, text, uuid, numeric, numeric)
  set schema private;
revoke all on function private.place_order(text, text, text, text, text, text, uuid, jsonb, text, uuid, numeric, numeric)
  from public, anon, authenticated, service_role;

create or replace function public.get_order_idempotency_result(
  p_actor_key text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_response jsonb;
begin
  select request_hash, response
  into v_hash, v_response
  from private.order_idempotency
  where actor_key = p_actor_key
    and idempotency_key = p_idempotency_key;

  if not found then return null; end if;
  if v_hash <> p_request_hash then
    raise exception 'IDEMPOTENCY_CONFLICT: key belongs to a different request';
  end if;
  return v_response;
end;
$$;

create or replace function public.place_order(
  p_shipping_name text,
  p_shipping_email text,
  p_shipping_phone text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_governorate text,
  p_user_id uuid,
  p_items jsonb,
  p_idempotency_key uuid,
  p_idempotency_actor text,
  p_request_hash text,
  p_coupon_code text default null,
  p_address_id uuid default null,
  p_flat_shipping_fee_egp numeric default 0,
  p_free_shipping_threshold_egp numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_existing_hash text;
  v_existing_response jsonb;
  v_result jsonb;
  v_group_id uuid;
begin
  if p_idempotency_actor is null
     or length(p_idempotency_actor) > 160
     or p_idempotency_actor !~ '^(user|guest):' then
    raise exception 'INVALID_IDEMPOTENCY_ACTOR';
  end if;
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_REQUEST_HASH';
  end if;

  insert into private.order_idempotency (
    actor_key, idempotency_key, request_hash
  ) values (
    p_idempotency_actor, p_idempotency_key, p_request_hash
  )
  on conflict (actor_key, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select request_hash, response
    into v_existing_hash, v_existing_response
    from private.order_idempotency
    where actor_key = p_idempotency_actor
      and idempotency_key = p_idempotency_key
    for update;

    if v_existing_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_CONFLICT: key belongs to a different request';
    end if;
    if v_existing_response is null then
      raise exception 'IDEMPOTENCY_RESULT_MISSING';
    end if;
    return v_existing_response || jsonb_build_object('replayed', true);
  end if;

  v_result := private.place_order(
    p_shipping_name,
    p_shipping_email,
    p_shipping_phone,
    p_shipping_address,
    p_shipping_city,
    p_shipping_governorate,
    p_user_id,
    p_items,
    p_coupon_code,
    p_address_id,
    p_flat_shipping_fee_egp,
    p_free_shipping_threshold_egp
  );

  v_group_id := (v_result ->> 'order_group_id')::uuid;
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    insert into private.coupon_redemptions (order_group_id, coupon_code)
    values (v_group_id, upper(btrim(p_coupon_code)))
    on conflict (order_group_id) do nothing;
  end if;

  update private.order_idempotency
  set response = v_result
  where actor_key = p_idempotency_actor
    and idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_group_id uuid;
  v_item record;
  v_restocked integer := 0;
  v_released_coupon text;
begin
  select order_group_id into v_group_id
  from public.orders
  where id = p_order_id;

  if v_group_id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_group_id::text, 0)
  );

  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if v_status = 'cancelled' then raise exception 'ALREADY_CANCELLED'; end if;
  if v_status = 'shipped' then raise exception 'CANNOT_CANCEL_SHIPPED'; end if;
  if v_status = 'fulfilled' then raise exception 'CANNOT_CANCEL_FULFILLED'; end if;

  for v_item in
    select oi.variant_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.variant_id is not null
  loop
    if v_item.quantity <= 0 then raise exception 'INVALID_ORDER_ITEM_QUANTITY'; end if;
    update public.product_variants
    set quantity = quantity + v_item.quantity, updated_at = now()
    where id = v_item.variant_id;
    v_restocked := v_restocked + 1;
  end loop;

  update public.orders set status = 'cancelled' where id = p_order_id;
  insert into public.order_status_history (order_id, status, note)
  values (p_order_id, 'cancelled', null);

  if not exists (
    select 1 from public.orders sibling
    where sibling.order_group_id = v_group_id
      and sibling.status <> 'cancelled'
  ) then
    update private.coupon_redemptions
    set released_at = now()
    where order_group_id = v_group_id
      and released_at is null
    returning coupon_code into v_released_coupon;

    if v_released_coupon is not null then
      update public.coupons
      set used_count = used_count - 1
      where code = v_released_coupon and used_count > 0;
    end if;
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'restocked_variants', v_restocked,
    'coupon_released', v_released_coupon is not null
  );
end;
$$;

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
  v_fulfillment_type text;
  v_allowed boolean := false;
begin
  select status, fulfillment_type
  into v_current_status, v_fulfillment_type
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_current_status <> p_expected_status then
    raise exception 'ORDER_STATUS_CONFLICT: current status is %', v_current_status;
  end if;
  if p_new_status = 'cancelled' then
    raise exception 'USE_CANCEL_ORDER';
  end if;

  v_allowed :=
    (v_current_status = 'pending' and p_new_status = 'paid')
    or (
      v_current_status = 'paid'
      and (
        (v_fulfillment_type = 'brand_direct' and p_new_status = 'preparing')
        or (v_fulfillment_type = 'mahaly_pool' and p_new_status = 'shipped')
      )
    )
    or (v_current_status = 'preparing' and p_new_status = 'shipped')
    or (v_current_status = 'shipped' and p_new_status = 'fulfilled');

  if not v_allowed then
    raise exception 'INVALID_ORDER_TRANSITION: % -> %', v_current_status, p_new_status;
  end if;

  update public.orders set status = p_new_status where id = p_order_id;
  insert into public.order_status_history (order_id, status, note, created_by)
  values (p_order_id, p_new_status, p_note, p_actor_id);

  return jsonb_build_object(
    'order_id', p_order_id,
    'previous_status', v_current_status,
    'status', p_new_status
  );
end;
$$;

revoke all on function public.get_order_idempotency_result(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_order_idempotency_result(text, uuid, text)
  to service_role;

revoke all on function public.place_order(text, text, text, text, text, text, uuid, jsonb, uuid, text, text, text, uuid, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.place_order(text, text, text, text, text, text, uuid, jsonb, uuid, text, text, text, uuid, numeric, numeric)
  to service_role;

revoke all on function public.cancel_order(uuid) from public, anon, authenticated;
grant execute on function public.cancel_order(uuid) to service_role;

revoke all on function public.transition_order_status(uuid, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.transition_order_status(uuid, text, text, uuid, text)
  to service_role;
