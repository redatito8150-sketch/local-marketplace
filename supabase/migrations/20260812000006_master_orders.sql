-- ============================================================================
-- Master Order — Phase 1
-- ============================================================================
-- Promotes orders.order_group_id (a bare, un-FK'd repeated UUID with no
-- parent record, no totals, no status of its own) into a real
-- public.master_orders parent row with its own customer-facing purchase
-- number (ZK-XXXXXX, matching order_number's LC-XXXXXX generation scheme).
--
-- Deliberately NOT included (see the project's own Zakhnook Master
-- Reference, docs/zakhnook-master-reference.md §11 and §25 — "Do not
-- redesign or migrate it casually" / exact status model is an open pending
-- decision): no master_orders.status column and no stored aggregate totals.
-- A "purchase status"/total is always derived at read time from the child
-- orders rows sharing one master_order_id — never stored, never a second
-- invariant to keep in sync.
--
-- Reuses the EXISTING order_group_id value as the new table's id (backfill
-- needs no remapping of orders rows), then renames the column in place —
-- an O(1) catalog operation, not a table rewrite.
-- ============================================================================

create table public.master_orders (
  id uuid primary key default gen_random_uuid(),
  master_order_number text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index master_orders_user_id_idx on public.master_orders (user_id);
create index master_orders_number_idx on public.master_orders (master_order_number);

alter table public.master_orders enable row level security;

-- Same ownership shape orders/order_status_history already use — a
-- customer reads their own; every admin/brand-portal read goes through
-- supabaseAdmin (service_role), same convention as everywhere else.
create policy "Users can read their own master orders"
  on public.master_orders for select
  using (user_id = auth.uid());

revoke all on public.master_orders from public, anon;
grant select on public.master_orders to authenticated;
grant all on public.master_orders to service_role;

-- ============================================================================
-- Backfill: one master_orders row per distinct existing order_group_id,
-- reusing that same value as the new row's id. A bounded per-group retry
-- loop (not a single set-based INSERT) so a random-number collision is
-- simply retried, exactly matching this codebase's own established
-- order_number generation idiom — safe and fast for a one-time migration
-- regardless of row count, not a hot path.
-- ============================================================================
do $$
declare
  v_group record;
  v_number text;
  v_attempt int;
begin
  for v_group in
    select
      order_group_id,
      (array_agg(user_id) filter (where user_id is not null))[1] as user_id,
      min(created_at) as created_at
    from public.orders
    group by order_group_id
  loop
    v_attempt := 0;
    loop
      v_number := 'ZK-' || lpad(floor(random() * 1000000)::text, 6, '0');
      begin
        insert into public.master_orders (id, master_order_number, user_id, created_at)
        values (v_group.order_group_id, v_number, v_group.user_id, v_group.created_at);
        exit;
      exception when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt >= 10 then
          raise exception 'Could not generate a unique master order number during backfill for group %', v_group.order_group_id;
        end if;
      end;
    end loop;
  end loop;
end;
$$;

alter table public.orders
  add constraint orders_master_order_id_fkey
  foreign key (order_group_id) references public.master_orders(id);

alter table public.orders rename column order_group_id to master_order_id;
alter index orders_order_group_id_idx rename to orders_master_order_id_idx;

alter table private.coupon_redemptions rename column order_group_id to master_order_id;
alter table private.coupon_redemptions
  add constraint coupon_redemptions_master_order_id_fkey
  foreign key (master_order_id) references public.master_orders(id);

-- payment_attempts.order_group_id previously had no FK at all ("a group
-- spans multiple orders rows, nothing single-row to reference" — see
-- 20260811000001_payment_attempts.sql). There is now a real single-row
-- parent to reference, so this closes that gap.
alter table public.payment_attempts rename column order_group_id to master_order_id;
alter table public.payment_attempts
  add constraint payment_attempts_master_order_id_fkey
  foreign key (master_order_id) references public.master_orders(id);

-- ============================================================================
-- private.place_order() — Cash on Delivery bucketing (body unchanged except
-- master_orders creation replacing a bare gen_random_uuid(), and the
-- order_group_id column references below it becoming master_order_id).
-- Signature unchanged — create or replace on the exact existing parameter
-- list correctly replaces the function already living in the private
-- schema (moved there by 20260810000005_order_integrity_and_idempotency.sql).
-- ============================================================================
create or replace function private.place_order(
  p_shipping_name text,
  p_shipping_email text,
  p_shipping_phone text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_governorate text,
  p_user_id uuid,
  p_items jsonb,
  p_coupon_code text default null,
  p_address_id uuid default null,
  p_flat_shipping_fee_egp numeric default 0,
  p_free_shipping_threshold_egp numeric default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_group_id uuid;
  v_master_order_number text;
  v_mo_attempt int;
  v_bucket_keys text[] := '{}';
  v_bucket_key text;
  v_item jsonb;
  v_brand_slug text;
  v_is_partner boolean;
  v_order_id uuid;
  v_order_number text;
  v_attempt int;
  v_variant_id uuid;
  v_quantity int;
  v_price numeric(10, 2);
  v_currency text;
  v_line_total numeric(10, 2);
  v_updated int;
  v_subtotal_usd numeric(10, 2);
  v_subtotal_egp numeric(10, 2);
  v_bucket_fulfillment_type text;
  v_bucket_brand_slug text;
  v_shipping_fee numeric(10, 2);
  v_coupon coupons%rowtype;
  v_coupon_code text;
  v_total_subtotal_egp numeric(10, 2) := 0;
  v_total_discount_egp numeric(10, 2) := 0;
  v_discount_assigned numeric(10, 2) := 0;
  v_bucket_discount numeric(10, 2);
  v_results jsonb := '[]'::jsonb;
  v_bucket_count int;
  v_bucket_index int := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART: no items to order';
  end if;

  -- Master order — created once per checkout, same random+retry pattern
  -- used for each bucket's own order_number below. p_items is already
  -- validated non-empty above, so at least one bucket/order row is always
  -- about to be created in this call — unlike place_paid_order() (which
  -- can genuinely process zero successful buckets and must avoid an
  -- orphan master_orders row for that reason), COD's place_order() is one
  -- atomic transaction: if anything downstream fails, the whole call
  -- (including this insert) rolls back together, so there is no equivalent
  -- partial-failure/orphan-row case to guard against here.
  v_mo_attempt := 0;
  loop
    v_master_order_number := 'ZK-' || lpad(floor(random() * 1000000)::text, 6, '0');
    begin
      insert into master_orders (master_order_number, user_id)
      values (v_master_order_number, p_user_id)
      returning id into v_group_id;
      exit;
    exception when unique_violation then
      v_mo_attempt := v_mo_attempt + 1;
      if v_mo_attempt >= 5 then
        raise exception 'Could not generate a unique master order number';
      end if;
    end;
  end loop;

  -- Pass 1: derive each item's fulfillment bucket key and collect the
  -- distinct set. Partner-brand items always land in one shared
  -- '__mahaly_pool__' bucket; a null/legacy brand_slug (no attribution)
  -- also falls into the pool bucket, since Mahaly is the delivery fallback
  -- of last resort. Every other brand gets its own key (its slug).
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_brand_slug := nullif(v_item ->> 'brand_slug', '');
    v_is_partner := false;
    if v_brand_slug is not null then
      select coalesce(is_mahaly_partner, false) into v_is_partner
      from brands where slug = v_brand_slug;
    end if;
    v_bucket_key := case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end;
    if not (v_bucket_key = any(v_bucket_keys)) then
      v_bucket_keys := array_append(v_bucket_keys, v_bucket_key);
    end if;
  end loop;

  v_bucket_count := array_length(v_bucket_keys, 1);

  -- Pass 2: compute each bucket's EGP subtotal up front (needed to split the
  -- coupon discount proportionally before any order rows are written).
  for v_bucket_key in select unnest(v_bucket_keys)
  loop
    v_subtotal_egp := 0;
    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_brand_slug := nullif(v_item ->> 'brand_slug', '');
      v_is_partner := false;
      if v_brand_slug is not null then
        select coalesce(is_mahaly_partner, false) into v_is_partner from brands where slug = v_brand_slug;
      end if;
      if (case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end) = v_bucket_key
         and (v_item ->> 'currency') = 'EGP' then
        v_subtotal_egp := v_subtotal_egp + (v_item ->> 'price')::numeric * (v_item ->> 'quantity')::int;
      end if;
    end loop;
    v_total_subtotal_egp := v_total_subtotal_egp + v_subtotal_egp;
  end loop;

  if p_coupon_code is not null and p_coupon_code <> '' then
    v_coupon_code := upper(p_coupon_code);
    select * into v_coupon from coupons where code = v_coupon_code for update;

    if not found then
      raise exception 'COUPON_INVALID: code not found';
    end if;
    if not v_coupon.active then
      raise exception 'COUPON_INVALID: this code is no longer active';
    end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at < now() then
      raise exception 'COUPON_INVALID: this code has expired';
    end if;
    if v_coupon.max_uses is not null and v_coupon.used_count >= v_coupon.max_uses then
      raise exception 'COUPON_INVALID: this code has reached its usage limit';
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_total_discount_egp := round(v_total_subtotal_egp * v_coupon.discount_value / 100, 2);
    else
      v_total_discount_egp := least(v_coupon.discount_value, v_total_subtotal_egp);
    end if;

    update coupons set used_count = used_count + 1 where code = v_coupon_code;
  end if;

  -- Pass 3: materialize one orders row per bucket, insert its items,
  -- decrement stock, and assign its share of the discount + shipping fee.
  for v_bucket_key in select unnest(v_bucket_keys)
  loop
    v_bucket_index := v_bucket_index + 1;
    v_subtotal_usd := 0;
    v_subtotal_egp := 0;
    v_bucket_fulfillment_type := case when v_bucket_key = '__mahaly_pool__' then 'mahaly_pool' else 'brand_direct' end;
    v_bucket_brand_slug := case when v_bucket_key = '__mahaly_pool__' then null else v_bucket_key end;

    v_attempt := 0;
    loop
      v_order_number := 'LC-' || floor(100000 + random() * 900000)::text;
      begin
        insert into orders (
          order_number, user_id, shipping_name, shipping_email, shipping_phone,
          shipping_address, shipping_city, shipping_governorate, subtotal_usd, subtotal_egp,
          address_id, master_order_id, fulfillment_type, brand_slug
        ) values (
          v_order_number, p_user_id, p_shipping_name, p_shipping_email, p_shipping_phone,
          p_shipping_address, p_shipping_city, p_shipping_governorate, 0, 0,
          p_address_id, v_group_id, v_bucket_fulfillment_type, v_bucket_brand_slug
        )
        returning id into v_order_id;
        exit;
      exception when unique_violation then
        v_attempt := v_attempt + 1;
        if v_attempt >= 5 then
          raise exception 'Could not generate a unique order number';
        end if;
      end;
    end loop;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_brand_slug := nullif(v_item ->> 'brand_slug', '');
      v_is_partner := false;
      if v_brand_slug is not null then
        select coalesce(is_mahaly_partner, false) into v_is_partner from brands where slug = v_brand_slug;
      end if;
      if (case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end) <> v_bucket_key then
        continue;
      end if;

      v_quantity := (v_item ->> 'quantity')::int;
      v_price := (v_item ->> 'price')::numeric;
      v_currency := v_item ->> 'currency';
      v_variant_id := nullif(v_item ->> 'variant_id', '')::uuid;

      if v_variant_id is not null then
        update product_variants
        set quantity = quantity - v_quantity, updated_at = now()
        where id = v_variant_id
          and quantity >= v_quantity
          and selling_status = 'active';

        get diagnostics v_updated = row_count;
        if v_updated = 0 then
          raise exception 'INSUFFICIENT_STOCK: %', v_item ->> 'name';
        end if;
      end if;

      insert into order_items (
        order_id, product_id, variant_id, name, brand, brand_slug, price, currency, size, color, quantity, image
      ) values (
        v_order_id, v_item ->> 'product_id', v_variant_id, v_item ->> 'name', v_item ->> 'brand',
        v_brand_slug, v_price, v_currency, v_item ->> 'size',
        nullif(v_item ->> 'color', ''), v_quantity, v_item ->> 'image'
      );

      v_line_total := v_price * v_quantity;
      if v_currency = 'EGP' then
        v_subtotal_egp := v_subtotal_egp + v_line_total;
      else
        v_subtotal_usd := v_subtotal_usd + v_line_total;
      end if;
    end loop;

    -- Discount: proportional by this bucket's EGP subtotal share; the last
    -- bucket absorbs whatever rounding remainder is left so the parts always
    -- sum exactly to v_total_discount_egp.
    if v_total_discount_egp > 0 then
      if v_bucket_index = v_bucket_count then
        v_bucket_discount := v_total_discount_egp - v_discount_assigned;
      elsif v_total_subtotal_egp > 0 then
        v_bucket_discount := round(v_total_discount_egp * v_subtotal_egp / v_total_subtotal_egp, 2);
      else
        v_bucket_discount := 0;
      end if;
      v_discount_assigned := v_discount_assigned + v_bucket_discount;
    else
      v_bucket_discount := 0;
    end if;

    -- Shipping fee: one flat fee per shipment/bucket, waived if that
    -- bucket's own EGP subtotal already clears the free-shipping threshold.
    if p_free_shipping_threshold_egp is not null and v_subtotal_egp >= p_free_shipping_threshold_egp then
      v_shipping_fee := 0;
    else
      v_shipping_fee := coalesce(p_flat_shipping_fee_egp, 0);
    end if;

    update orders
    set subtotal_usd = v_subtotal_usd,
        subtotal_egp = v_subtotal_egp,
        coupon_code = v_coupon_code,
        discount_amount_egp = v_bucket_discount,
        shipping_fee_egp = v_shipping_fee
    where id = v_order_id;

    insert into order_status_history (order_id, status, note)
    values (v_order_id, 'pending', null);

    v_results := v_results || jsonb_build_object(
      'order_id', v_order_id,
      'order_number', v_order_number,
      'fulfillment_type', v_bucket_fulfillment_type,
      'brand_slug', v_bucket_brand_slug,
      'shipping_fee_egp', v_shipping_fee,
      'discount_amount_egp', v_bucket_discount
    );
  end loop;

  return jsonb_build_object(
    'master_order_id', v_group_id,
    'master_order_number', v_master_order_number,
    'orders', v_results,
    'discount_amount_egp', v_total_discount_egp
  );
end;
$$;

-- ============================================================================
-- public.place_order() — idempotent wrapper. Only change: reads
-- master_order_id (not order_group_id) from the private function's result
-- for the coupon_redemptions bookkeeping key. Idempotency dedup, coupon
-- redemption insert, and response caching are otherwise unchanged.
-- ============================================================================
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

  v_group_id := (v_result ->> 'master_order_id')::uuid;
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    insert into private.coupon_redemptions (master_order_id, coupon_code)
    values (v_group_id, upper(btrim(p_coupon_code)))
    on conflict (master_order_id) do nothing;
  end if;

  update private.order_idempotency
  set response = v_result
  where actor_key = p_idempotency_actor
    and idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

-- ============================================================================
-- public.cancel_order() — pure column rename (order_group_id ->
-- master_order_id) everywhere it's read, including the per-group advisory
-- lock and the coupon-release sibling check. No behavioral change.
-- ============================================================================
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
  select master_order_id into v_group_id
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
    where sibling.master_order_id = v_group_id
      and sibling.status <> 'cancelled'
  ) then
    update private.coupon_redemptions
    set released_at = now()
    where master_order_id = v_group_id
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

-- ============================================================================
-- public.cancel_order_group() — admin-only "cancel this whole purchase."
-- Renamed param (p_order_group_id -> p_master_order_id). Real pre-existing
-- bug fixed here: the old `and user_id = p_user_id` filter matched nothing
-- for a guest checkout (orders.user_id is null; `null = anything` is never
-- true in SQL), and this was never caught because the function had zero
-- callers until now. Admin needs to cancel any group regardless of
-- ownership (guest or not), so the ownership parameter/filter is dropped
-- entirely — authorization is the calling route's job
-- (requireAdminUser()), matching how PATCH /api/admin/orders/[id] already
-- trusts its own route gate rather than re-checking ownership in SQL.
-- Still service_role-only — never exposed to authenticated.
-- ============================================================================
create or replace function public.cancel_order_group(p_master_order_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_order record;
  v_cancelled uuid[] := '{}';
  v_skipped uuid[] := '{}';
begin
  for v_order in
    select id from orders where master_order_id = p_master_order_id for update
  loop
    begin
      perform public.cancel_order(v_order.id);
      v_cancelled := array_append(v_cancelled, v_order.id);
    exception when others then
      v_skipped := array_append(v_skipped, v_order.id);
    end;
  end loop;

  if array_length(v_cancelled, 1) is null and array_length(v_skipped, 1) is null then
    raise exception 'MASTER_ORDER_NOT_FOUND';
  end if;

  return jsonb_build_object('cancelled_order_ids', v_cancelled, 'skipped_order_ids', v_skipped);
end;
$$;

revoke all on function public.cancel_order_group(uuid) from public, anon, authenticated;
grant execute on function public.cancel_order_group(uuid) to service_role;

-- ============================================================================
-- public.place_paid_order() — card/Paymob path.
--
-- The one genuinely tricky change in this migration: the master_orders row
-- must be created before any bucket's `orders` insert (which needs a
-- non-null master_order_id), but must NOT be created inside any bucket's
-- own begin/exception block — a bucket that raises an exception rolls back
-- everything inside its own block, but a PL/pgSQL variable assignment
-- (v_group_id) is NOT part of that rollback, so if the master_orders
-- insert lived inside bucket 1's block and bucket 1 then failed, v_group_id
-- would keep pointing at a row that no longer exists, and every subsequent
-- bucket's `orders` insert would fail its foreign key against that
-- rolled-back row. Fix: create it once, right after Pass 1 computes the
-- bucket list and before Pass 2's per-bucket loop begins — fully outside
-- any exception-catching scope. Reused as-is (no new row) on a retry where
-- payment_attempts.master_order_id is already set from a prior partial run.
--
-- Accepted trade-off, documented rather than silently swallowed: if this
-- guard's "at least one bucket not yet fulfilled" check passes but every
-- bucket subsequently fails anyway, the master_orders row created up front
-- is left with zero child orders (a harmless orphan — a purchase number
-- with no shipments, never surfaced anywhere since nothing queries a
-- master_orders row except via its children). This is preferable to the
-- alternative (creating it lazily inside a bucket's block), which risks
-- the FK-violation cascade described above. An attempt where every bucket
-- was already fulfilled from a prior run never reaches this code at all —
-- it's caught by the top-of-function status short-circuit below.
-- ============================================================================
create or replace function public.place_paid_order(p_payment_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt record;
  v_group_id uuid;
  v_master_order_number text;
  v_mo_attempt int;
  v_bucket_keys text[] := '{}';
  v_bucket_key text;
  v_item jsonb;
  v_brand_slug text;
  v_is_partner boolean;
  v_order_id uuid;
  v_order_number text;
  v_variant_id uuid;
  v_quantity int;
  v_price numeric(10, 2);
  v_currency text;
  v_line_total numeric(10, 2);
  v_updated int;
  v_subtotal_usd numeric(10, 2);
  v_subtotal_egp numeric(10, 2);
  v_bucket_fulfillment_type text;
  v_bucket_brand_slug text;
  v_bucket_brand_id uuid;
  v_shipping_fee numeric(10, 2);
  v_flat_fee numeric(10, 2);
  v_free_threshold numeric(10, 2);
  v_shipping_settings jsonb;
  v_attempt_no int;
  v_any_fulfilled boolean;
  v_any_failed boolean;
begin
  select * into v_attempt from public.payment_attempts where id = p_payment_attempt_id for update;
  if not found then
    raise exception 'PAYMENT_ATTEMPT_NOT_FOUND';
  end if;

  if v_attempt.status in ('fulfilled', 'fulfillment_failed') then
    return jsonb_build_object(
      'payment_attempt_id', p_payment_attempt_id,
      'status', v_attempt.status,
      'master_order_id', v_attempt.master_order_id,
      'replayed', true
    );
  end if;

  if v_attempt.status not in ('paid', 'reflecting') then
    raise exception 'PAYMENT_ATTEMPT_NOT_PAID: current status is %, expected paid', v_attempt.status;
  end if;

  if v_attempt.status = 'paid' then
    update public.payment_attempts set status = 'reflecting', updated_at = now() where id = p_payment_attempt_id;
  end if;

  v_group_id := v_attempt.master_order_id;

  select value into v_shipping_settings from public.site_content where key = 'shipping_settings';
  v_flat_fee := coalesce((v_shipping_settings ->> 'flatDeliveryFeeEgp')::numeric, 50);
  v_free_threshold := coalesce((v_shipping_settings ->> 'freeShippingThresholdEgp')::numeric, 1500);

  -- Pass 1: distinct bucket keys — identical rule to place_order(): a
  -- Zakhnook-partner brand (or a missing brand attribution) pools into
  -- '__mahaly_pool__'; every other brand gets its own key.
  for v_item in select * from jsonb_array_elements(v_attempt.cart_snapshot)
  loop
    v_brand_slug := nullif(v_item ->> 'brandSlug', '');
    v_is_partner := false;
    if v_brand_slug is not null then
      select coalesce(is_mahaly_partner, false) into v_is_partner from public.brands where slug = v_brand_slug;
    end if;
    v_bucket_key := case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end;
    if not (v_bucket_key = any(v_bucket_keys)) then
      v_bucket_keys := array_append(v_bucket_keys, v_bucket_key);
    end if;
  end loop;

  -- Create the master order once, outside any bucket's exception scope —
  -- see the function-level comment above for why this must not move
  -- inside the loop below.
  if v_group_id is null and exists (
    select 1 from unnest(v_bucket_keys) as bk(key)
    where not exists (
      select 1 from private.payment_attempt_fulfillments
      where payment_attempt_id = p_payment_attempt_id and bucket_key = bk.key and status = 'fulfilled'
    )
  ) then
    v_mo_attempt := 0;
    loop
      v_master_order_number := 'ZK-' || lpad(floor(random() * 1000000)::text, 6, '0');
      begin
        insert into public.master_orders (master_order_number, user_id)
        values (v_master_order_number, v_attempt.user_id)
        returning id into v_group_id;
        exit;
      exception when unique_violation then
        v_mo_attempt := v_mo_attempt + 1;
        if v_mo_attempt >= 5 then
          raise exception 'Could not generate a unique master order number';
        end if;
      end;
    end loop;
  end if;

  -- Pass 2: one bucket at a time, each isolated.
  for v_bucket_key in select unnest(v_bucket_keys)
  loop
    if exists (
      select 1 from private.payment_attempt_fulfillments
      where payment_attempt_id = p_payment_attempt_id and bucket_key = v_bucket_key and status = 'fulfilled'
    ) then
      continue;
    end if;

    begin
      v_bucket_fulfillment_type := case when v_bucket_key = '__mahaly_pool__' then 'mahaly_pool' else 'brand_direct' end;
      v_bucket_brand_slug := case when v_bucket_key = '__mahaly_pool__' then null else v_bucket_key end;
      v_bucket_brand_id := null;
      if v_bucket_brand_slug is not null then
        select id into v_bucket_brand_id from public.brands where slug = v_bucket_brand_slug;
      end if;

      v_subtotal_usd := 0;
      v_subtotal_egp := 0;

      v_attempt_no := 0;
      loop
        v_order_number := 'LC-' || floor(100000 + random() * 900000)::text;
        begin
          insert into public.orders (
            order_number, user_id, status, payment_method, payment_status, payment_attempt_id,
            shipping_name, shipping_email, shipping_phone, shipping_address, shipping_city, shipping_governorate,
            subtotal_usd, subtotal_egp, master_order_id, fulfillment_type, brand_slug
          ) values (
            v_order_number, v_attempt.user_id, 'paid', 'card', 'paid', p_payment_attempt_id,
            btrim(coalesce(v_attempt.shipping_snapshot ->> 'firstName', '') || ' ' || coalesce(v_attempt.shipping_snapshot ->> 'lastName', '')),
            v_attempt.shipping_snapshot ->> 'email',
            v_attempt.shipping_snapshot ->> 'phone',
            v_attempt.shipping_snapshot ->> 'address',
            v_attempt.shipping_snapshot ->> 'city',
            v_attempt.shipping_snapshot ->> 'governorate',
            0, 0, v_group_id, v_bucket_fulfillment_type, v_bucket_brand_slug
          )
          returning id into v_order_id;
          exit;
        exception when unique_violation then
          v_attempt_no := v_attempt_no + 1;
          if v_attempt_no >= 5 then
            raise exception 'Could not generate a unique order number';
          end if;
        end;
      end loop;

      for v_item in select * from jsonb_array_elements(v_attempt.cart_snapshot)
      loop
        v_brand_slug := nullif(v_item ->> 'brandSlug', '');
        v_is_partner := false;
        if v_brand_slug is not null then
          select coalesce(is_mahaly_partner, false) into v_is_partner from public.brands where slug = v_brand_slug;
        end if;
        if (case when v_is_partner or v_brand_slug is null then '__mahaly_pool__' else v_brand_slug end) <> v_bucket_key then
          continue;
        end if;

        v_quantity := (v_item ->> 'quantity')::int;
        v_price := (v_item ->> 'price')::numeric;
        v_currency := v_item ->> 'currency';
        v_variant_id := nullif(v_item ->> 'variantId', '')::uuid;

        if v_variant_id is not null then
          update public.product_variants
          set quantity = quantity - v_quantity, updated_at = now()
          where id = v_variant_id and quantity >= v_quantity and selling_status = 'active';

          get diagnostics v_updated = row_count;
          if v_updated = 0 then
            raise exception 'INSUFFICIENT_STOCK: %', v_item ->> 'name';
          end if;
        end if;

        insert into public.order_items (
          order_id, product_id, variant_id, name, brand, brand_slug, price, currency, size, color, quantity, image
        ) values (
          v_order_id, v_item ->> 'productId', v_variant_id, v_item ->> 'name', v_item ->> 'brand',
          v_brand_slug, v_price, v_currency, v_item ->> 'size', nullif(v_item ->> 'color', ''), v_quantity,
          coalesce(v_item ->> 'image', '')
        );

        v_line_total := v_price * v_quantity;
        if v_currency = 'EGP' then
          v_subtotal_egp := v_subtotal_egp + v_line_total;
        else
          v_subtotal_usd := v_subtotal_usd + v_line_total;
        end if;
      end loop;

      if v_subtotal_egp >= v_free_threshold then
        v_shipping_fee := 0;
      else
        v_shipping_fee := v_flat_fee;
      end if;

      update public.orders
      set subtotal_usd = v_subtotal_usd, subtotal_egp = v_subtotal_egp, shipping_fee_egp = v_shipping_fee
      where id = v_order_id;

      insert into public.order_status_history (order_id, status, note)
      values (v_order_id, 'paid', 'Card payment confirmed via Paymob webhook');

      insert into private.payment_attempt_fulfillments (
        payment_attempt_id, bucket_key, brand_id, status, order_id, expected_amount_cents, fulfilled_at
      ) values (
        p_payment_attempt_id, v_bucket_key, v_bucket_brand_id, 'fulfilled', v_order_id,
        round((v_subtotal_egp + v_shipping_fee) * 100)::int, now()
      )
      on conflict (payment_attempt_id, bucket_key) do update set
        status = 'fulfilled',
        order_id = excluded.order_id,
        expected_amount_cents = excluded.expected_amount_cents,
        failure_reason = null,
        fulfilled_at = now(),
        updated_at = now();

    exception when others then
      insert into private.payment_attempt_fulfillments (
        payment_attempt_id, bucket_key, brand_id, status, expected_amount_cents, failure_reason
      ) values (
        p_payment_attempt_id, v_bucket_key, v_bucket_brand_id, 'failed', 0, sqlerrm
      )
      on conflict (payment_attempt_id, bucket_key) do update set
        status = 'failed',
        failure_reason = excluded.failure_reason,
        updated_at = now();
    end;
  end loop;

  select
    coalesce(bool_or(status = 'fulfilled'), false),
    coalesce(bool_or(status = 'failed'), false)
  into v_any_fulfilled, v_any_failed
  from private.payment_attempt_fulfillments
  where payment_attempt_id = p_payment_attempt_id;

  if v_any_fulfilled then
    update public.payment_attempts
    set status = 'fulfilled', master_order_id = v_group_id, processed_at = now(), updated_at = now()
    where id = p_payment_attempt_id;
  else
    update public.payment_attempts
    set status = 'fulfillment_failed', processed_at = now(), updated_at = now()
    where id = p_payment_attempt_id;
  end if;

  return jsonb_build_object(
    'payment_attempt_id', p_payment_attempt_id,
    'status', case when v_any_fulfilled then 'fulfilled' else 'fulfillment_failed' end,
    'master_order_id', case when v_any_fulfilled then v_group_id else null end,
    'is_partial', (v_any_fulfilled and v_any_failed),
    'replayed', false
  );
end;
$$;

revoke all on function public.place_paid_order(uuid) from public, anon, authenticated;
grant execute on function public.place_paid_order(uuid) to service_role;
