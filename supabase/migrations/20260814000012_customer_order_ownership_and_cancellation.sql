-- Recover guest checkouts for the owner of the same verified email and add
-- an atomic, customer-scoped COD cancellation boundary. Both functions are
-- service-role only; the API resolves the authenticated user and never lets
-- a browser choose another account id.

create index if not exists orders_unclaimed_shipping_email_idx
  on public.orders (lower(btrim(shipping_email)))
  where user_id is null;

create or replace function public.claim_guest_orders_for_account(
  p_user_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_email text;
  v_master_ids uuid[] := '{}';
  v_orders_claimed integer := 0;
  v_masters_claimed integer := 0;
begin
  select lower(btrim(email))
    into v_auth_email
  from auth.users
  where id = p_user_id
    and email_confirmed_at is not null;

  if v_auth_email is null or v_auth_email <> lower(btrim(p_email)) then
    raise exception 'VERIFIED_EMAIL_MISMATCH';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('claim-order:' || p_user_id::text, 0)
  );

  select coalesce(array_agg(distinct o.master_order_id), '{}')
    into v_master_ids
  from public.orders o
  where o.user_id is null
    and lower(btrim(o.shipping_email)) = v_auth_email
    and not exists (
      select 1
      from public.orders sibling
      where sibling.master_order_id = o.master_order_id
        and sibling.user_id is not null
        and sibling.user_id <> p_user_id
    );

  if cardinality(v_master_ids) = 0 then
    return jsonb_build_object('orders_claimed', 0, 'master_orders_claimed', 0);
  end if;

  update public.master_orders
  set user_id = p_user_id
  where id = any(v_master_ids)
    and user_id is null;
  get diagnostics v_masters_claimed = row_count;

  update public.orders
  set user_id = p_user_id
  where master_order_id = any(v_master_ids)
    and user_id is null
    and lower(btrim(shipping_email)) = v_auth_email;
  get diagnostics v_orders_claimed = row_count;

  return jsonb_build_object(
    'orders_claimed', v_orders_claimed,
    'master_orders_claimed', v_masters_claimed
  );
end;
$$;

revoke all on function public.claim_guest_orders_for_account(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_guest_orders_for_account(uuid, text)
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

  perform 1
  from public.orders
  where master_order_id = p_master_order_id
  for update;

  if not found then raise exception 'MASTER_ORDER_NOT_FOUND'; end if;
  if exists (
    select 1 from public.orders
    where master_order_id = p_master_order_id
      and user_id is distinct from p_user_id
  ) then raise exception 'ORDER_NOT_OWNED'; end if;
  if exists (
    select 1 from public.orders
    where master_order_id = p_master_order_id
      and payment_method <> 'cash_on_delivery'
  ) then raise exception 'CARD_ORDER_REQUIRES_REFUND_REVIEW'; end if;
  if exists (
    select 1 from public.orders
    where master_order_id = p_master_order_id
      and status not in ('pending', 'preparing', 'cancelled')
  ) then raise exception 'ORDER_CAN_NO_LONGER_BE_CANCELLED'; end if;
  if exists (
    select 1 from public.orders
    where master_order_id = p_master_order_id
      and payment_status <> 'unpaid'
  ) then raise exception 'PAID_ORDER_REQUIRES_REFUND_REVIEW'; end if;

  for v_order in
    select id from public.orders
    where master_order_id = p_master_order_id
      and status <> 'cancelled'
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
