-- ============================================================================
-- Multi-brand cart + partner-fulfillment order splitting + order tracking.
--
-- Business rule (owner-specified): Mahaly is ALWAYS responsible for actual
-- delivery, in every case. The distinction below is about who prepares/packs
-- the goods and, as a side effect, how many delivery fees a checkout incurs:
--
--   - "Partner" brands (brands.is_mahaly_partner = true) keep their stock in
--     Mahaly's own warehouse, so any number of partner-brand items in one
--     cart ship together as ONE shipment, ONE delivery fee — regardless of
--     how many distinct partner brands are represented.
--   - Non-partner ("independent") brands each pack/prepare their own goods
--     (Mahaly still delivers), so every distinct non-partner brand in a cart
--     becomes its OWN order/shipment with its OWN delivery fee — buying from
--     2 independent brands means 2 delivery fees, 2 shipments, but still one
--     checkout/one purchase.
--
-- A single checkout can therefore fan out into multiple `orders` rows, tied
-- together by a new `order_group_id` so the customer/admin can still see
-- them as one purchase event.
-- ============================================================================

-- 1. Brand partner flag — defaults false (independent) for every existing
--    brand; an admin opts a brand into the pooled-warehouse model explicitly.
alter table brands add column if not exists is_mahaly_partner boolean not null default false;

-- 2. Order splitting/fulfillment columns.
alter table orders add column if not exists order_group_id uuid;
alter table orders add column if not exists fulfillment_type text not null default 'brand_direct';
alter table orders add column if not exists brand_slug text references brands(slug) on delete set null;
alter table orders add column if not exists shipping_fee_egp numeric(10, 2) not null default 0;

alter table orders drop constraint if exists orders_fulfillment_type_check;
alter table orders add constraint orders_fulfillment_type_check
  check (fulfillment_type in ('mahaly_pool', 'brand_direct'));

-- Backfill: every pre-existing order becomes its own single-order group, and
-- keeps the (harmless, historical) default 'brand_direct' label — it predates
-- this split and was never actually brand-scoped, so the label is not load
-- bearing for old rows, only for anything created from here on.
update orders set order_group_id = gen_random_uuid() where order_group_id is null;

alter table orders alter column order_group_id set not null;
alter table orders alter column order_group_id set default gen_random_uuid();

create index if not exists orders_order_group_id_idx on orders (order_group_id);
create index if not exists orders_brand_slug_idx on orders (brand_slug);
create index if not exists brands_is_mahaly_partner_idx on brands (is_mahaly_partner) where is_mahaly_partner;

-- 3. New order status: 'preparing' — the window between payment and the
--    brand handing a self-fulfilled order off to Mahaly's courier. Pooled
--    (mahaly_pool) orders are expected to skip straight from paid to shipped
--    since Mahaly's own warehouse has no separate "brand packs it" step, but
--    the column allows it there too rather than special-casing it.
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pending', 'paid', 'preparing', 'shipped', 'fulfilled', 'cancelled'));

-- 4. Order status history — a real, customer/brand/admin-visible tracking
--    timeline. Distinct from `audit_logs` (which is an admin action log, not
--    customer-facing) and append-only by design.
create table if not exists order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists order_status_history_order_id_idx on order_status_history (order_id, created_at);

alter table order_status_history enable row level security;

-- Writes only ever happen via security-definer RPCs (place_order/cancel_order)
-- or service_role (admin/brand-portal status-change API routes), same
-- convention as order_items/orders themselves — no insert policy needed.
drop policy if exists "Users can read their own order status history" on order_status_history;
create policy "Users can read their own order status history"
  on order_status_history for select
  using (
    exists (
      select 1 from orders
      where orders.id = order_status_history.order_id
        and orders.user_id = auth.uid()
    )
  );

drop policy if exists "Brand owners can read status history for their orders" on order_status_history;
create policy "Brand owners can read status history for their orders"
  on order_status_history for select
  to authenticated
  using (public.brand_owns_order_item(order_status_history.order_id));

-- ============================================================================
-- place_order() rewrite — groups p_items into one order per fulfillment
-- bucket (one pooled Mahaly order + one order per distinct non-partner
-- brand), computes a per-bucket shipping fee, and splits any coupon discount
-- proportionally by each bucket's EGP subtotal share (remainder absorbed by
-- the last bucket so the parts always sum to the whole-cart discount).
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
  v_group_id uuid := gen_random_uuid();
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
          address_id, order_group_id, fulfillment_type, brand_slug
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
    'order_group_id', v_group_id,
    'orders', v_results,
    'discount_amount_egp', v_total_discount_egp
  );
end;
$$;

-- cancel_order() itself is unchanged (still per-order, which is now finer
-- grained and more useful than before — cancelling one shipment out of a
-- multi-shipment purchase no longer touches its siblings). It also now
-- records the cancellation in the tracking history.
create or replace function public.cancel_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_coupon_code text;
  v_item record;
  v_restocked int := 0;
begin
  select status, coupon_code into v_status, v_coupon_code from orders where id = p_order_id for update;

  if v_status is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_status = 'cancelled' then
    raise exception 'ALREADY_CANCELLED';
  end if;
  if v_status = 'fulfilled' then
    raise exception 'CANNOT_CANCEL_FULFILLED';
  end if;

  for v_item in
    select oi.variant_id, oi.quantity
    from order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is not null
  loop
    update product_variants
    set quantity = quantity + v_item.quantity, updated_at = now()
    where id = v_item.variant_id;
    v_restocked := v_restocked + 1;
  end loop;

  if v_coupon_code is not null then
    update coupons set used_count = greatest(used_count - 1, 0) where code = v_coupon_code;
  end if;

  update orders set status = 'cancelled' where id = p_order_id;

  insert into order_status_history (order_id, status, note)
  values (p_order_id, 'cancelled', null);

  return jsonb_build_object('order_id', p_order_id, 'restocked_variants', v_restocked);
end;
$$;

-- New: cancel every order in a group (the customer-facing "cancel my whole
-- purchase" action) — cancels what it still can and reports which order ids
-- were skipped (already shipped/fulfilled/cancelled), rather than aborting
-- the whole batch over one already-progressed shipment.
create or replace function public.cancel_order_group(p_order_group_id uuid, p_user_id uuid)
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
    select id from orders where order_group_id = p_order_group_id and user_id = p_user_id for update
  loop
    begin
      perform public.cancel_order(v_order.id);
      v_cancelled := array_append(v_cancelled, v_order.id);
    exception when others then
      v_skipped := array_append(v_skipped, v_order.id);
    end;
  end loop;

  if array_length(v_cancelled, 1) is null and array_length(v_skipped, 1) is null then
    raise exception 'ORDER_GROUP_NOT_FOUND';
  end if;

  return jsonb_build_object('cancelled_order_ids', v_cancelled, 'skipped_order_ids', v_skipped);
end;
$$;
