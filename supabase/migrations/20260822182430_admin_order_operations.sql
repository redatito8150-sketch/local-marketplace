-- Admin order operations: shipment tracking, durable update timestamps, and
-- purchase-level pagination. Application code calls the two read functions
-- with the service-role client only; ordinary authenticated users keep their
-- existing column-scoped/RLS reads and cannot execute the admin functions.

alter table public.orders
  add column if not exists carrier_name text,
  add column if not exists tracking_number text,
  add column if not exists expected_delivery_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.orders
  drop constraint if exists orders_carrier_name_length_check,
  add constraint orders_carrier_name_length_check
    check (carrier_name is null or char_length(btrim(carrier_name)) between 1 and 120),
  drop constraint if exists orders_tracking_number_length_check,
  add constraint orders_tracking_number_length_check
    check (tracking_number is null or char_length(btrim(tracking_number)) between 1 and 160);

update public.orders o
set updated_at = greatest(
  o.created_at,
  coalesce(
    (select max(h.created_at) from public.order_status_history h where h.order_id = o.id),
    o.created_at
  )
);

create or replace function private.touch_orders_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.touch_orders_updated_at() from public, anon, authenticated;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
before update on public.orders
for each row execute function private.touch_orders_updated_at();

create index if not exists orders_master_status_created_idx
  on public.orders (master_order_id, status, created_at desc);
create index if not exists orders_updated_at_idx
  on public.orders (updated_at desc);
create index if not exists order_items_order_brand_idx
  on public.order_items (order_id, brand);

create or replace function public.list_admin_order_purchase_page(
  p_q text default null,
  p_queue text default 'all',
  p_status text default null,
  p_brand text default null,
  p_from date default null,
  p_to date default null,
  p_offset integer default 0,
  p_limit integer default 12
)
returns table (
  master_order_id uuid,
  latest_order_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with order_flags as (
    select
      o.id,
      o.master_order_id,
      o.created_at,
      case when o.status in ('pending', 'paid') then 'confirmed' else o.status end as canonical_status,
      (
        (o.payment_method = 'card' and o.payment_status = 'unpaid')
        or (
          case when o.status in ('pending', 'paid') then 'confirmed' else o.status end
          in ('confirmed', 'preparing', 'ready_for_pickup', 'shipped')
          and (
            o.fulfillment_type = 'mahaly_pool'
            or case when o.status in ('pending', 'paid') then 'confirmed' else o.status end
              in ('ready_for_pickup', 'shipped')
          )
        )
        or (
          o.expected_delivery_at is not null
          and o.expected_delivery_at < now()
          and case when o.status in ('pending', 'paid') then 'confirmed' else o.status end
            not in ('fulfilled', 'cancelled')
        )
        or (
          case when o.status in ('pending', 'paid') then 'confirmed' else o.status end = 'shipped'
          and nullif(btrim(o.tracking_number), '') is null
        )
        or exists (
          select 1
          from public.payment_refund_requests r
          where r.order_id = o.id and r.status = 'pending'
        )
      ) as needs_action
    from public.orders o
  ), purchase_flags as (
    select
      f.master_order_id,
      max(f.created_at) as latest_order_at,
      bool_or(f.needs_action) as needs_action,
      bool_or(f.canonical_status in ('confirmed', 'preparing', 'ready_for_pickup', 'shipped')) as is_active,
      bool_or(f.canonical_status = 'fulfilled') as has_fulfilled,
      bool_or(f.canonical_status = 'cancelled') as has_cancelled
    from order_flags f
    group by f.master_order_id
  ), matching as (
    select pf.master_order_id, pf.latest_order_at
    from purchase_flags pf
    where
      (
        coalesce(nullif(p_queue, ''), 'all') = 'all'
        or (p_queue = 'attention' and pf.needs_action)
        or (p_queue = 'active' and pf.is_active)
        or (p_queue = 'fulfilled' and pf.has_fulfilled)
        or (p_queue = 'cancelled' and pf.has_cancelled)
      )
      and (
        p_from is null
        or (pf.latest_order_at at time zone 'Africa/Cairo')::date >= p_from
      )
      and (
        p_to is null
        or (pf.latest_order_at at time zone 'Africa/Cairo')::date <= p_to
      )
      and (
        nullif(btrim(p_status), '') is null
        or exists (
          select 1 from public.orders o
          where o.master_order_id = pf.master_order_id
            and (case when o.status in ('pending', 'paid') then 'confirmed' else o.status end) = p_status
        )
      )
      and (
        nullif(btrim(p_brand), '') is null
        or exists (
          select 1
          from public.orders o
          join public.order_items i on i.order_id = o.id
          where o.master_order_id = pf.master_order_id
            and lower(i.brand) = lower(btrim(p_brand))
        )
      )
      and (
        nullif(btrim(p_q), '') is null
        or exists (
          select 1
          from public.orders o
          left join public.order_items i on i.order_id = o.id
          left join public.master_orders m on m.id = o.master_order_id
          where o.master_order_id = pf.master_order_id
            and (
              lower(concat_ws(' ',
                m.master_order_number,
                o.order_number,
                o.shipping_name,
                o.shipping_email,
                o.shipping_phone,
                i.name,
                i.brand,
                i.color,
                i.size
              )) like '%' || lower(btrim(p_q)) || '%'
              or (
                char_length(regexp_replace(translate(lower(btrim(p_q)), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^a-z0-9]', '', 'g')) >= 3
                and regexp_replace(lower(coalesce(m.master_order_number, '')), '[^a-z0-9]', '', 'g')
                  like '%' || regexp_replace(translate(lower(btrim(p_q)), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^a-z0-9]', '', 'g') || '%'
              )
              or (
                char_length(regexp_replace(translate(lower(btrim(p_q)), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^a-z0-9]', '', 'g')) >= 3
                and regexp_replace(lower(o.order_number), '[^a-z0-9]', '', 'g')
                  like '%' || regexp_replace(translate(lower(btrim(p_q)), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^a-z0-9]', '', 'g') || '%'
              )
            )
        )
      )
  )
  select
    matching.master_order_id,
    matching.latest_order_at,
    count(*) over() as total_count
  from matching
  order by matching.latest_order_at desc, matching.master_order_id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 12), 1), 100);
$$;

revoke all on function public.list_admin_order_purchase_page(text, text, text, text, date, date, integer, integer)
  from public, anon, authenticated;
grant execute on function public.list_admin_order_purchase_page(text, text, text, text, date, date, integer, integer)
  to service_role;

create or replace function public.get_admin_order_purchase_queue_counts()
returns table (
  all_count bigint,
  attention_count bigint,
  active_count bigint,
  fulfilled_count bigint,
  cancelled_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with order_flags as (
    select
      o.master_order_id,
      case when o.status in ('pending', 'paid') then 'confirmed' else o.status end as canonical_status,
      (
        (o.payment_method = 'card' and o.payment_status = 'unpaid')
        or (
          case when o.status in ('pending', 'paid') then 'confirmed' else o.status end
          in ('confirmed', 'preparing', 'ready_for_pickup', 'shipped')
          and (
            o.fulfillment_type = 'mahaly_pool'
            or case when o.status in ('pending', 'paid') then 'confirmed' else o.status end
              in ('ready_for_pickup', 'shipped')
          )
        )
        or (
          o.expected_delivery_at is not null
          and o.expected_delivery_at < now()
          and case when o.status in ('pending', 'paid') then 'confirmed' else o.status end
            not in ('fulfilled', 'cancelled')
        )
        or (
          case when o.status in ('pending', 'paid') then 'confirmed' else o.status end = 'shipped'
          and nullif(btrim(o.tracking_number), '') is null
        )
        or exists (
          select 1
          from public.payment_refund_requests r
          where r.order_id = o.id and r.status = 'pending'
        )
      ) as needs_action
    from public.orders o
  ), purchase_flags as (
    select
      master_order_id,
      bool_or(needs_action) as needs_action,
      bool_or(canonical_status in ('confirmed', 'preparing', 'ready_for_pickup', 'shipped')) as is_active,
      bool_or(canonical_status = 'fulfilled') as has_fulfilled,
      bool_or(canonical_status = 'cancelled') as has_cancelled
    from order_flags
    group by master_order_id
  )
  select
    count(*)::bigint,
    count(*) filter (where needs_action)::bigint,
    count(*) filter (where is_active)::bigint,
    count(*) filter (where has_fulfilled)::bigint,
    count(*) filter (where has_cancelled)::bigint
  from purchase_flags;
$$;

revoke all on function public.get_admin_order_purchase_queue_counts()
  from public, anon, authenticated;
grant execute on function public.get_admin_order_purchase_queue_counts()
  to service_role;

create or replace function public.list_admin_order_filter_brands()
returns table (brand text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct btrim(i.brand) as brand
  from public.order_items i
  where nullif(btrim(i.brand), '') is not null
  order by brand;
$$;

revoke all on function public.list_admin_order_filter_brands()
  from public, anon, authenticated;
grant execute on function public.list_admin_order_filter_brands()
  to service_role;
