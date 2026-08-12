-- ============================================================================
-- Historical order pricing snapshots + item-level coupon allocation.
--
-- Today order_items.price only ever stores the final PAID unit price (after
-- any product/variant discount, before a coupon). Once a brand edits/removes
-- a discount, or a coupon is disabled, there is no way to answer "what was
-- this actually sold for, and why" for a past order — Brand Portal and Admin
-- can only show the current price, which is wrong for history, and refunds
-- have nothing authoritative to refund against. This migration adds a
-- point-in-time snapshot to every order_items row going forward and extends
-- the existing bucket-level coupon allocation (see private.place_order's
-- Pass 2/3 below) one level deeper, to the individual item.
--
-- All four new columns are nullable / safe-defaulted — historical rows keep
-- them null (or 0 for the coupon share) forever. Never backfilled, never
-- derived from a product's current price. See CLAUDE.md's "never rewrite
-- order history" principle, already followed by the USD/EGP split this
-- table already has.
-- ============================================================================

alter table public.order_items add column if not exists original_unit_price numeric(10, 2);
alter table public.order_items add column if not exists discount_percent_snapshot numeric(5, 2);
alter table public.order_items add column if not exists discount_source text;
alter table public.order_items add column if not exists item_coupon_discount_egp numeric(10, 2) not null default 0;

alter table public.order_items drop constraint if exists order_items_discount_source_valid;
alter table public.order_items add constraint order_items_discount_source_valid
  check (discount_source is null or discount_source in ('product_discount', 'variant_discount', 'none'));

alter table public.order_items drop constraint if exists order_items_item_coupon_discount_nonnegative;
alter table public.order_items add constraint order_items_item_coupon_discount_nonnegative
  check (item_coupon_discount_egp >= 0);

comment on column public.order_items.original_unit_price is
  'Pre-discount unit price at the moment of purchase. Null for historical rows placed before this column existed — never backfilled from a product''s current price.';
comment on column public.order_items.discount_percent_snapshot is
  'The product/variant discount percent actually applied to this line, null if none. Describes only the per-unit discount, not a coupon.';
comment on column public.order_items.discount_source is
  E'Why price differs from original_unit_price: ''product_discount'', ''variant_discount'', or ''none''. Coupon savings are never recorded here — a coupon does not change price, it is a separate cart-level reduction (see item_coupon_discount_egp and orders.discount_amount_egp).';
comment on column public.order_items.item_coupon_discount_egp is
  'This line''s own share of the order''s coupon discount, in EGP. Coupons only ever apply against EGP subtotals, so USD lines are always 0. Sums exactly to orders.discount_amount_egp for the order this line belongs to.';

-- ============================================================================
-- private.place_order() — Cash on Delivery. Body identical to the version in
-- 20260812000006_master_orders.sql except: Pass 3 now runs two sub-passes per
-- bucket instead of one. Sub-pass A sums the bucket's EGP subtotal and EGP
-- item count WITHOUT inserting anything (needed up front, since each item's
-- own coupon share depends on knowing the bucket's total first). Sub-pass B
-- does the actual stock decrement + order_items insert, now also writing the
-- pricing snapshot fields and each item's own proportional coupon share
-- (round to the piaster, last EGP item in the bucket absorbs the rounding
-- remainder) — the exact same deterministic pattern already used one level
-- up for the bucket's own share of the total discount, just applied again
-- one level deeper. This guarantees sum(item_coupon_discount_egp) over a
-- bucket's items equals that bucket's own discount_amount_egp exactly, which
-- is what Section 5's per-unit refund allocation depends on.
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
  v_bucket_egp_item_count int;
  v_bucket_egp_item_seen int;
  v_bucket_discount_assigned numeric(10, 2);
  v_item_coupon_discount numeric(10, 2);
  v_original_unit_price numeric(10, 2);
  v_discount_percent_snapshot numeric(5, 2);
  v_discount_source text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART: no items to order';
  end if;

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
  -- distinct set.
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

  -- Pass 3: materialize one orders row per bucket. Two sub-passes per
  -- bucket: A computes the bucket's own EGP subtotal/item-count (mirrors
  -- Pass 2's per-bucket loop; recomputing here rather than caching an array
  -- keeps this consistent with the rest of this function's existing
  -- re-loop-and-refilter style), B inserts items + snapshots + per-item
  -- coupon share.
  for v_bucket_key in select unnest(v_bucket_keys)
  loop
    v_bucket_index := v_bucket_index + 1;
    v_bucket_fulfillment_type := case when v_bucket_key = '__mahaly_pool__' then 'mahaly_pool' else 'brand_direct' end;
    v_bucket_brand_slug := case when v_bucket_key = '__mahaly_pool__' then null else v_bucket_key end;

    -- Sub-pass A: bucket EGP subtotal + EGP item count, no writes.
    v_subtotal_egp := 0;
    v_bucket_egp_item_count := 0;
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
      if (v_item ->> 'currency') = 'EGP' then
        v_subtotal_egp := v_subtotal_egp + (v_item ->> 'price')::numeric * (v_item ->> 'quantity')::int;
        v_bucket_egp_item_count := v_bucket_egp_item_count + 1;
      end if;
    end loop;

    -- Bucket's own share of the total discount: proportional by this
    -- bucket's EGP subtotal share; the last bucket absorbs whatever
    -- rounding remainder is left so the parts always sum exactly to
    -- v_total_discount_egp.
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

    -- Sub-pass B: actual inserts, with each item's own coupon share.
    v_subtotal_usd := 0;
    v_subtotal_egp := 0;
    v_bucket_egp_item_seen := 0;
    v_bucket_discount_assigned := 0;
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
      v_original_unit_price := nullif(v_item ->> 'original_unit_price', '')::numeric;
      v_discount_percent_snapshot := nullif(v_item ->> 'discount_percent_snapshot', '')::numeric;
      v_discount_source := nullif(v_item ->> 'discount_source', '');

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

      if v_currency = 'EGP' and v_bucket_discount > 0 then
        v_bucket_egp_item_seen := v_bucket_egp_item_seen + 1;
        if v_bucket_egp_item_seen = v_bucket_egp_item_count then
          v_item_coupon_discount := v_bucket_discount - v_bucket_discount_assigned;
        else
          v_item_coupon_discount := round(v_bucket_discount * (v_price * v_quantity) / v_subtotal_egp, 2);
        end if;
        v_bucket_discount_assigned := v_bucket_discount_assigned + v_item_coupon_discount;
      else
        v_item_coupon_discount := 0;
      end if;

      insert into order_items (
        order_id, product_id, variant_id, name, brand, brand_slug, price, currency, size, color, quantity, image,
        original_unit_price, discount_percent_snapshot, discount_source, item_coupon_discount_egp
      ) values (
        v_order_id, v_item ->> 'product_id', v_variant_id, v_item ->> 'name', v_item ->> 'brand',
        v_brand_slug, v_price, v_currency, v_item ->> 'size',
        nullif(v_item ->> 'color', ''), v_quantity, v_item ->> 'image',
        v_original_unit_price, v_discount_percent_snapshot, v_discount_source, v_item_coupon_discount
      );

      v_line_total := v_price * v_quantity;
      if v_currency = 'EGP' then
        v_subtotal_egp := v_subtotal_egp + v_line_total;
      else
        v_subtotal_usd := v_subtotal_usd + v_line_total;
      end if;
    end loop;

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
-- public.place_paid_order() — card/Paymob path. Body identical to the
-- version in 20260812000006_master_orders.sql except: the item insert now
-- also writes the pricing snapshot fields and item_coupon_discount_egp, both
-- read straight off each cart_snapshot line (populated at intention-creation
-- time by lib/payments/intentionCart.ts's resolveIntentionCart()/
-- allocateCouponDiscount() — the exact amount actually charged via Paymob,
-- since the discount was already baked into the Intention's amount before
-- the customer ever paid). This function deliberately does NOT re-derive or
-- re-validate the coupon discount at fulfillment time: the customer already
-- paid the discounted amount, so re-computing it here could only ever
-- produce a mismatch between what was charged and what gets recorded, never
-- a correction. Each bucket's own orders.discount_amount_egp/coupon_code is
-- rolled up from the sum of its own items' snapshot values instead of a
-- separate allocation pass, so this function needs no new coupon-lookup
-- logic of its own — it's just recording, once, what the Node-side
-- allocation already decided. coupons.used_count is incremented exactly
-- once per payment attempt (not per bucket), guarded by v_had_prior_fulfillment
-- so a webhook retry after a partial success can never double-count a
-- redemption.
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
  v_had_prior_fulfillment boolean;
  v_original_unit_price numeric(10, 2);
  v_discount_percent_snapshot numeric(5, 2);
  v_discount_source text;
  v_item_coupon_discount numeric(10, 2);
  v_bucket_discount_egp numeric(10, 2);
  v_coupon_code text;
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
  v_coupon_code := nullif(v_attempt.coupon_snapshot ->> 'code', '');

  select exists (
    select 1 from private.payment_attempt_fulfillments
    where payment_attempt_id = p_payment_attempt_id and status = 'fulfilled'
  ) into v_had_prior_fulfillment;

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
  -- see the function-level comment in the migration that introduced this
  -- (20260812000006_master_orders.sql) for why this must not move inside
  -- the loop below.
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
      v_bucket_discount_egp := 0;

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
        v_original_unit_price := nullif(v_item ->> 'originalUnitPrice', '')::numeric;
        v_discount_percent_snapshot := nullif(v_item ->> 'discountPercentSnapshot', '')::numeric;
        v_discount_source := nullif(v_item ->> 'discountSource', '');
        v_item_coupon_discount := coalesce(nullif(v_item ->> 'itemCouponDiscountEgp', '')::numeric, 0);

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
          order_id, product_id, variant_id, name, brand, brand_slug, price, currency, size, color, quantity, image,
          original_unit_price, discount_percent_snapshot, discount_source, item_coupon_discount_egp
        ) values (
          v_order_id, v_item ->> 'productId', v_variant_id, v_item ->> 'name', v_item ->> 'brand',
          v_brand_slug, v_price, v_currency, v_item ->> 'size', nullif(v_item ->> 'color', ''), v_quantity,
          coalesce(v_item ->> 'image', ''),
          v_original_unit_price, v_discount_percent_snapshot, v_discount_source, v_item_coupon_discount
        );

        v_line_total := v_price * v_quantity;
        if v_currency = 'EGP' then
          v_subtotal_egp := v_subtotal_egp + v_line_total;
          v_bucket_discount_egp := v_bucket_discount_egp + v_item_coupon_discount;
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
      set subtotal_usd = v_subtotal_usd,
          subtotal_egp = v_subtotal_egp,
          shipping_fee_egp = v_shipping_fee,
          coupon_code = case when v_bucket_discount_egp > 0 then v_coupon_code else null end,
          discount_amount_egp = v_bucket_discount_egp
      where id = v_order_id;

      insert into public.order_status_history (order_id, status, note)
      values (v_order_id, 'paid', 'Card payment confirmed via Paymob webhook');

      insert into private.payment_attempt_fulfillments (
        payment_attempt_id, bucket_key, brand_id, status, order_id, expected_amount_cents, fulfilled_at
      ) values (
        p_payment_attempt_id, v_bucket_key, v_bucket_brand_id, 'fulfilled', v_order_id,
        round((v_subtotal_egp - v_bucket_discount_egp + v_shipping_fee) * 100)::int, now()
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

  -- Coupon redemption is counted once per checkout, not once per bucket —
  -- only when this call is the first time ANY bucket of this attempt has
  -- ever reached 'fulfilled', so a webhook retry that only mops up a
  -- previously-failed bucket never double-counts.
  if v_coupon_code is not null and v_any_fulfilled and not v_had_prior_fulfillment then
    update public.coupons set used_count = used_count + 1 where code = v_coupon_code;
  end if;

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
