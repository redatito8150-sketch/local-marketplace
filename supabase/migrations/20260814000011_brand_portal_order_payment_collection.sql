-- Payment collection is deliberately separate from fulfillment status in the
-- schema, but a successful COD delivery is the point at which cash becomes
-- collected in Zakhnook's current operating model. Keep the evidence (time,
-- actor and source) on the immutable order and update both states atomically.

alter table public.orders
  add column if not exists payment_collected_at timestamptz,
  add column if not exists payment_collected_by uuid references auth.users(id) on delete set null,
  add column if not exists payment_collection_source text;

alter table public.orders
  drop constraint if exists orders_payment_collection_source_check;
alter table public.orders
  add constraint orders_payment_collection_source_check
  check (payment_collection_source is null or payment_collection_source in ('card_payment', 'delivery_confirmation'));

create index if not exists idx_orders_payment_collected_by
  on public.orders (payment_collected_by)
  where payment_collected_by is not null;

comment on column public.orders.payment_collected_at is
  'When payment was actually confirmed as collected, independently from fulfillment status.';
comment on column public.orders.payment_collected_by is
  'Actor who confirmed COD collection; null for provider-confirmed card payments.';
comment on column public.orders.payment_collection_source is
  'card_payment or delivery_confirmation; retained for payment audit and reconciliation.';

create or replace function private.stamp_card_payment_collection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_method = 'card'
     and new.payment_status = 'paid'
     and new.payment_collected_at is null then
    new.payment_collected_at := now();
    new.payment_collection_source := 'card_payment';
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_card_payment_collection on public.orders;
create trigger stamp_card_payment_collection
before insert or update of payment_status on public.orders
for each row execute function private.stamp_card_payment_collection();

revoke all on function private.stamp_card_payment_collection()
  from public, anon, authenticated;

-- Existing card orders were provider-confirmed before the order was inserted.
update public.orders
set payment_collected_at = created_at,
    payment_collection_source = 'card_payment'
where payment_method = 'card'
  and payment_status = 'paid'
  and payment_collected_at is null;

-- Historical fulfilled COD orders follow the same business rule. The final
-- status-history event supplies the closest trustworthy collection timestamp
-- and the actor who confirmed delivery.
update public.orders o
set payment_status = 'paid',
    payment_collected_at = coalesce((
      select h.created_at
      from public.order_status_history h
      where h.order_id = o.id and h.status = 'fulfilled'
      order by h.created_at desc
      limit 1
    ), o.created_at),
    payment_collected_by = (
      select h.created_by
      from public.order_status_history h
      where h.order_id = o.id and h.status = 'fulfilled'
      order by h.created_at desc
      limit 1
    ),
    payment_collection_source = 'delivery_confirmation'
where o.payment_method = 'cash_on_delivery'
  and o.status = 'fulfilled'
  and o.payment_status = 'unpaid';

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
  v_payment_method text;
  v_payment_status text;
  v_allowed boolean := false;
begin
  select status, fulfillment_type, payment_method, payment_status
  into v_current_status, v_fulfillment_type, v_payment_method, v_payment_status
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
  values (p_order_id, p_new_status, p_note, p_actor_id);

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
