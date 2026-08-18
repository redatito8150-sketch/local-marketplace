
-- ============================================================================
-- Requirement 6 (inventory permissions) + requirement 7 (cutover safety),
-- enforced at the database level, not just the API layer:
--   - A zakhnook_fulfilled brand's own actors can never move
--     product_variants.quantity directly (neither via the brand-portal nor
--     the admin inventory-adjustments UI) â€” only a warehouse receipt or
--     apply_warehouse_stock_correction() may.
--   - While a brand has a non-terminal fulfillment transition open, no
--     direct adjustment is allowed at all (cutover safety).
--   - A variant cannot be archived while it still has stock anywhere, an
--     open warehouse document line, unresolved quarantine, or an open
--     order obligation.
--   - Checkout itself refuses to sell a brand's stock while that brand has
--     an open fulfillment transition (item 3 â€” the receipt-before-
--     activation order race): between a brand_fulfilled->zakhnook_fulfilled
--     transition's first accepted receipt and its activation,
--     product_variants.quantity for that brand is genuinely ambiguous â€”
--     physically at Zakhnook, but is_mahaly_partner/fulfillment_mode still
--     say brand_fulfilled â€” so an order placed in that window would be
--     wrongly bucketed as brand_direct fulfillment. Rather than trying to
--     atomically activate on the qualifying receipt (which would entangle
--     warehouse receiving with the transition workflow), checkout pauses
--     sales of that brand's stock for the whole transition window â€” the
--     same "prevent new unsafe adjustments during cutover" principle
--     already applied to inventory adjustments, applied to checkout too.
-- ============================================================================

-- Shared by private.place_order and public.place_paid_order below.
create or replace function private.is_brand_fulfillment_transition_open(p_brand_slug text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.brand_fulfillment_transitions bft
    join public.brands b on b.id = bft.brand_id
    where b.slug = p_brand_slug
      and bft.status not in ('completed', 'cancelled', 'failed')
  );
$$;

revoke all on function private.is_brand_fulfillment_transition_open(text)
  from public, anon, authenticated, service_role;

-- Re-declares private.place_order (created in supabase/migrations/
-- 20260812000006_master_orders.sql, already applied elsewhere â€” this repo's
-- established layering convention, see e.g. how create_variant_with_opening_stock
-- was extended in 20260814000004_product_launch_state.sql). Body is
-- byte-identical to that version except the stock-decrement WHERE clause
-- gains one extra condition. Same signature, same search_path.
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
  v_bucket_subtotal_egp numeric(10, 2);
  v_item_coupon_discount numeric(10, 2);
  v_original_unit_price numeric(10, 2);
  v_discount_percent_snapshot numeric(5, 2);
  v_discount_source text;
  v_last_discount_bucket_key text;
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
    if v_subtotal_egp > 0 then
      v_last_discount_bucket_key := v_bucket_key;
    end if;
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

  for v_bucket_key in select unnest(v_bucket_keys)
  loop
    v_bucket_index := v_bucket_index + 1;
    v_subtotal_egp := 0;
    v_bucket_fulfillment_type := case when v_bucket_key = '__mahaly_pool__' then 'mahaly_pool' else 'brand_direct' end;
    v_bucket_brand_slug := case when v_bucket_key = '__mahaly_pool__' then null else v_bucket_key end;

    -- Compute this bucket's EGP subtotal and line count before writing its
    -- items so the coupon can be allocated down to each line exactly.
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

    if v_total_discount_egp > 0 then
      if v_bucket_key = v_last_discount_bucket_key then
        v_bucket_discount := v_total_discount_egp - v_discount_assigned;
      elsif v_subtotal_egp > 0 and v_total_subtotal_egp > 0 then
        v_bucket_discount := round(v_total_discount_egp * v_subtotal_egp / v_total_subtotal_egp, 2);
      else
        v_bucket_discount := 0;
      end if;
      v_discount_assigned := v_discount_assigned + v_bucket_discount;
    else
      v_bucket_discount := 0;
    end if;
    v_bucket_subtotal_egp := v_subtotal_egp;

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
        -- Checked SEPARATELY from the stock-availability WHERE clause
        -- (not folded into one combined condition) so the two failure
        -- modes raise distinct, non-silent exceptions â€” see this
        -- migration's header comment. COD has no equivalent of the
        -- "already-charged" card-payment race (nothing is charged until
        -- the order is placed), but the same distinct-reason principle
        -- keeps this consistent with place_paid_order below.
        if private.is_brand_fulfillment_transition_open(v_brand_slug) then
          raise exception 'FULFILLMENT_TRANSITION_BLOCKS_ORDER: %', v_item ->> 'name';
        end if;

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
          v_item_coupon_discount := round(v_bucket_discount * (v_price * v_quantity) / v_bucket_subtotal_egp, 2);
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

-- Re-declares public.place_paid_order (also from 20260812000006_master_orders.sql)
-- with the identical extra guard on its own stock-decrement WHERE clause.
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
          -- Card-payment race, item 3: the customer has ALREADY been
          -- charged by Paymob by the time this runs â€” a bare
          -- INSUFFICIENT_STOCK here would misattribute the failure to a
          -- stock problem and bury the real cause. Checked separately so
          -- the recorded failure_reason (private.payment_attempt_fulfillments,
          -- surfaced in the admin Payments UI) is unambiguous:
          -- FULFILLMENT_TRANSITION_BLOCKS_ORDER means "the brand started a
          -- transition after this payment began â€” this charge needs manual
          -- review/refund," never silently folded into an ordinary stockout.
          -- request_fulfillment_mode_transition's OPEN_PAYMENT_ATTEMPT_PENDING
          -- blocker (20260814000002_fulfillment_mode.sql) and the intention
          -- route's own pre-charge rejection are what make this rare in
          -- practice; this is the last-resort safety net for the residual
          -- true-concurrency window between the two.
          if private.is_brand_fulfillment_transition_open(v_brand_slug) then
            raise exception 'FULFILLMENT_TRANSITION_BLOCKS_ORDER: %', v_item ->> 'name';
          end if;

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

revoke all on function private.place_order(
  text, text, text, text, text, text, uuid, jsonb, text, uuid, numeric, numeric
) from public, anon, authenticated, service_role;

revoke all on function public.place_paid_order(uuid) from public, anon, authenticated;
grant execute on function public.place_paid_order(uuid) to service_role;

create or replace function public.apply_inventory_adjustments(
  p_brand_id uuid,
  p_actor_id uuid,
  p_adjustments jsonb,
  p_reason text,
  p_note text,
  p_source text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp


as $$
declare
  v_item jsonb;
  v_variant record;
  v_type text;
  v_amount integer;
  v_new_quantity integer;
  v_delta integer;
  v_results jsonb := '[]'::jsonb;
  v_fulfillment_mode text;
  v_has_open_transition boolean;
begin
  if jsonb_typeof(p_adjustments) <> 'array'
     or jsonb_array_length(p_adjustments) = 0 then
    raise exception 'At least one inventory adjustment is required';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'An adjustment reason is required';
  end if;
  if nullif(trim(p_operation_key), '') is null then
    raise exception 'An operation key is required';
  end if;

  -- Locked FIRST â€” establishes the brand-then-variants lock order every
  -- transition/adjustment/correction RPC in this system now follows,
  -- consistent (never a variant-first lock racing a transition's own
  -- brand-first lock).
  select fulfillment_mode into v_fulfillment_mode from public.brands where id = p_brand_id for update;
  if v_fulfillment_mode is null then raise exception 'Brand not found'; end if;
  if v_fulfillment_mode = 'zakhnook_fulfilled' then
    raise exception 'PARTNER_DIRECT_ADJUSTMENT_FORBIDDEN: Zakhnook-held stock can only change via a warehouse receipt or an auditable warehouse correction';
  end if;

  select exists (
    select 1 from public.brand_fulfillment_transitions
    where brand_id = p_brand_id and status not in ('completed', 'cancelled', 'failed')
  ) into v_has_open_transition;
  if v_has_open_transition then
    raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS: inventory adjustments are paused during a fulfillment mode change';
  end if;

  for v_item in select * from jsonb_array_elements(p_adjustments)
  loop
    select pv.id, pv.product_id, pv.quantity, p.brand_id
      into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid
      and p.brand_id = p_brand_id
    for update of pv;

    if v_variant.id is null then
      raise exception 'Variant not found for this brand';
    end if;

    if exists (
      select 1 from public.inventory_movements
      where variant_id = v_variant.id
        and source_operation_key = p_operation_key
    ) then
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'variant_id', v_variant.id,
        'new_quantity', v_variant.quantity,
        'replayed', true
      ));
      continue;
    end if;

    v_type := v_item->>'type';
    v_amount := (v_item->>'amount')::integer;
    if v_amount is null or v_amount < 0 then
      raise exception 'Adjustment amount must be a non-negative integer';
    end if;

    if v_type = 'add' then
      v_new_quantity := v_variant.quantity + v_amount;
    elsif v_type = 'remove' then
      v_new_quantity := v_variant.quantity - v_amount;
    elsif v_type = 'set' then
      v_new_quantity := v_amount;
    else
      raise exception 'Invalid adjustment type';
    end if;
    if v_new_quantity < 0 then
      raise exception 'Inventory cannot become negative';
    end if;
    v_delta := v_new_quantity - v_variant.quantity;

    update public.product_variants
    set quantity = v_new_quantity, updated_at = now()
    where id = v_variant.id;

    insert into public.inventory_movements (
      variant_id, product_id, brand_id, previous_quantity, quantity_delta,
      new_quantity, movement_type, reason, note, created_by, source,
      source_operation_key, from_location, to_location, related_entity_type, related_entity_id
    ) values (
      v_variant.id, v_variant.product_id, p_brand_id, v_variant.quantity,
      v_delta, v_new_quantity,
      case when p_source = 'admin' then 'admin_correction' else 'manual_adjustment' end,
      p_reason, nullif(trim(p_note), ''), p_actor_id, p_source,
      p_operation_key,
      case when v_delta < 0 then 'brand_location' else null end,
      case when v_delta > 0 then 'brand_location' else 'sold_or_removed' end,
      'adjustment', v_variant.id
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'variant_id', v_variant.id,
      'previous_quantity', v_variant.quantity,
      'quantity_delta', v_delta,
      'new_quantity', v_new_quantity,
      'replayed', false
    ));
  end loop;
  return v_results;
end;
$$;

revoke all on function public.apply_inventory_adjustments(
  uuid,uuid,jsonb,text,text,text,text
) from public, anon, authenticated;
grant execute on function public.apply_inventory_adjustments(
  uuid,uuid,jsonb,text,text,text,text
) to service_role;

-- ============================================================================
-- Variant archive safety â€” a variant can never move from is_archived=false
-- to true while it still has stock anywhere, an open warehouse document
-- line, unresolved quarantine, or an open order obligation. This was
-- previously an app-layer-only check (lib/admin/variantPersistence.ts,
-- quantity > 0 only, not DB-enforced, not test-pinned) â€” this trigger adds
-- the missing defense-in-depth and the three additional conditions the
-- app layer never checked.
-- ============================================================================
create or replace function public.enforce_variant_archive_safety()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_open_orders integer;
  v_open_documents integer;
  v_unresolved_quarantine integer;
begin
  if tg_op <> 'UPDATE' or old.is_archived <> false or new.is_archived <> true then
    return new;
  end if;

  if new.quantity > 0 then
    raise exception 'VARIANT_ARCHIVE_BLOCKED_SELLABLE_STOCK';
  end if;
  if new.brand_stock_quantity > 0 then
    raise exception 'VARIANT_ARCHIVE_BLOCKED_DECLARED_BRAND_STOCK';
  end if;

  select count(*) into v_open_documents
  from public.warehouse_transfer_items wti
  join public.warehouse_transfers wt on wt.id = wti.transfer_id
  where wti.variant_id = new.id
    and wt.status not in ('received', 'rejected', 'cancelled');
  if v_open_documents > 0 then
    raise exception 'VARIANT_ARCHIVE_BLOCKED_OPEN_WAREHOUSE_DOCUMENT';
  end if;

  -- Only genuinely UNRESOLVED quarantine blocks archiving â€” a line whose
  -- quarantine_resolved_at is set (via resolve_warehouse_quarantine, see
  -- 20260814000003_warehouse_documents.sql) is a closed, permanent
  -- historical discrepancy record, not an open blocker.
  select count(*) into v_unresolved_quarantine
  from public.warehouse_transfer_items
  where variant_id = new.id
    and (coalesce(damaged_qty, 0) > 0 or coalesce(missing_qty, 0) > 0)
    and quarantine_resolved_at is null;
  if v_unresolved_quarantine > 0 then
    raise exception 'VARIANT_ARCHIVE_BLOCKED_UNRESOLVED_QUARANTINE';
  end if;

  select count(*) into v_open_orders
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.variant_id = new.id and o.status not in ('fulfilled', 'cancelled');
  if v_open_orders > 0 then
    raise exception 'VARIANT_ARCHIVE_BLOCKED_OPEN_ORDER';
  end if;

  return new;
end;
$$;

drop trigger if exists product_variants_enforce_archive_safety on public.product_variants;
create trigger product_variants_enforce_archive_safety
before update on public.product_variants
for each row execute function public.enforce_variant_archive_safety();

-- set_warehouse_brand_stock gains the same cutover-safety guard as
-- apply_inventory_adjustments â€” during an open fulfillment transition, a
-- brand's declared stock is already being reconciled by the transition RPCs
-- themselves (see 20260814000002_fulfillment_mode.sql), so an ordinary
-- self-service edit here would race against that reconciliation. Same
-- signature as the current version (20260810000006) â€” additive body change.
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
declare
  v_is_partner boolean;
  v_input_count integer;
  v_distinct_count integer;
  v_matched_count integer;
  v_update jsonb;
  v_quantity integer;
  v_pending integer;
  v_lock record;
  v_has_open_transition boolean;
begin
  if jsonb_typeof(p_updates) <> 'array' or jsonb_array_length(p_updates) = 0 then
    raise exception 'WAREHOUSE_STOCK_UPDATES_REQUIRED';
  end if;
  select count(*), count(distinct input.value->>'variant_id')
  into v_input_count, v_distinct_count
  from jsonb_array_elements(p_updates) as input(value);
  if v_distinct_count <> v_input_count then
    raise exception 'DUPLICATE_OR_INVALID_VARIANT';
  end if;

  select is_mahaly_partner into v_is_partner
  from public.brands where id = p_brand_id for update;
  if v_is_partner is null then raise exception 'BRAND_NOT_FOUND'; end if;
  if not v_is_partner then raise exception 'BRAND_NOT_PARTNER'; end if;

  select exists (
    select 1 from public.brand_fulfillment_transitions
    where brand_id = p_brand_id and status not in ('completed', 'cancelled', 'failed')
  ) into v_has_open_transition;
  if v_has_open_transition then
    raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS: declared stock is paused during a fulfillment mode change';
  end if;

  select count(*) into v_matched_count
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  join jsonb_array_elements(p_updates) as input(value)
    on pv.id = (input.value->>'variant_id')::uuid
  where p.brand_id = p_brand_id;
  if v_matched_count <> v_input_count then
    raise exception 'VARIANT_NOT_FOUND_FOR_BRAND';
  end if;

  for v_lock in
    select pv.id
    from public.product_variants pv
    join jsonb_array_elements(p_updates) as input(value)
      on pv.id = (input.value->>'variant_id')::uuid
    order by pv.id
    for update of pv
  loop
    null;
  end loop;

  for v_update in
    select value
    from jsonb_array_elements(p_updates) as input(value)
    order by (value->>'variant_id')::uuid
  loop
    v_quantity := (v_update->>'brand_stock_quantity')::integer;
    if v_quantity is null or v_quantity < 0 then
      raise exception 'INVALID_BRAND_STOCK_QUANTITY';
    end if;

    -- Allocated-but-not-yet-reconciled across every nonterminal document
    -- status (not just 'pending'), counting only unreconciled lines â€” same
    -- fix as request_warehouse_transfer's own pending-quantity check (see
    -- 20260814000003_warehouse_documents.sql), so a document that's moved
    -- past 'pending' (submitted/approved/in_transit/partially_received)
    -- still correctly holds its claim here.
    select coalesce(sum(wti.requested_qty), 0) into v_pending
    from public.warehouse_transfer_items wti
    join public.warehouse_transfers wt on wt.id = wti.transfer_id
    where wti.variant_id = (v_update->>'variant_id')::uuid
      and wt.direction = 'to_local'
      and wt.status not in ('received', 'rejected', 'cancelled')
      and wti.received_ok_qty is null;
    if v_quantity < v_pending then
      raise exception 'BRAND_STOCK_BELOW_PENDING_TRANSFERS';
    end if;

    update public.product_variants
    set brand_stock_quantity = v_quantity, updated_at = now()
    where id = (v_update->>'variant_id')::uuid;
  end loop;

  return true;
end;
$$;

revoke all on function public.set_warehouse_brand_stock(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_warehouse_brand_stock(uuid, uuid, jsonb) to service_role;

-- Re-declares apply_warehouse_stock_correction (created in
-- 20260814000001_stock_ledger_locations.sql, before brands.fulfillment_mode
-- / brand_fulfillment_transitions existed) adding the three restrictions
-- item 10 requires: lock the brand row first (brand-then-variant lock
-- order, same as every other RPC here), require the brand to actually be
-- in zakhnook_fulfilled mode (previously this could be called against ANY
-- brand's variant regardless of mode â€” a brand_fulfilled brand's stock
-- must go through apply_inventory_adjustments instead), and reject while a
-- fulfillment transition is open (the transition RPCs are themselves
-- reconciling this brand's balances during that window). Same signature â€”
-- purely additive/restrictive body change.
create or replace function public.apply_warehouse_stock_correction(
  p_variant_id uuid,
  p_actor_id uuid,
  p_delta integer,
  p_reason text,
  p_note text,
  p_operation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant record;
  v_new_quantity integer;
  v_brand_id uuid;
  v_fulfillment_mode text;
  v_has_open_transition boolean;
begin
  if p_delta = 0 then raise exception 'CORRECTION_DELTA_REQUIRED'; end if;
  if nullif(pg_catalog.btrim(p_reason), '') is null then raise exception 'CORRECTION_REASON_REQUIRED'; end if;
  if nullif(pg_catalog.btrim(p_operation_key), '') is null or length(p_operation_key) > 160 then
    raise exception 'INVALID_OPERATION_KEY';
  end if;

  select p.brand_id into v_brand_id from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = p_variant_id;
  if v_brand_id is null then raise exception 'VARIANT_NOT_FOUND'; end if;

  select fulfillment_mode into v_fulfillment_mode from public.brands where id = v_brand_id for update;
  if v_fulfillment_mode is null then raise exception 'BRAND_NOT_FOUND'; end if;
  if v_fulfillment_mode <> 'zakhnook_fulfilled' then
    raise exception 'CORRECTION_REQUIRES_ZAKHNOOK_FULFILLED_MODE';
  end if;

  select exists (
    select 1 from public.brand_fulfillment_transitions
    where brand_id = v_brand_id and status not in ('completed', 'cancelled', 'failed')
  ) into v_has_open_transition;
  if v_has_open_transition then
    raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS: warehouse corrections are paused during a fulfillment mode change';
  end if;

  select pv.id, pv.quantity, pv.product_id, p.brand_id into v_variant
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = p_variant_id
  for update of pv;
  if v_variant.id is null then raise exception 'VARIANT_NOT_FOUND'; end if;

  if exists (
    select 1 from public.inventory_movements
    where variant_id = v_variant.id and source_operation_key = p_operation_key
  ) then
    return jsonb_build_object('variant_id', v_variant.id, 'new_quantity', v_variant.quantity, 'replayed', true);
  end if;

  v_new_quantity := v_variant.quantity + p_delta;
  if v_new_quantity < 0 then raise exception 'CORRECTION_WOULD_GO_NEGATIVE'; end if;

  update public.product_variants
  set quantity = v_new_quantity, updated_at = now()
  where id = v_variant.id;

  insert into public.inventory_movements (
    variant_id, product_id, brand_id, previous_quantity, quantity_delta,
    new_quantity, movement_type, reason, note, created_by, source,
    source_operation_key, from_location, to_location,
    related_entity_type, related_entity_id
  ) values (
    v_variant.id, v_variant.product_id, v_variant.brand_id, v_variant.quantity,
    p_delta, v_new_quantity, 'admin_correction', p_reason,
    nullif(pg_catalog.btrim(p_note), ''), p_actor_id, 'warehouse_correction',
    p_operation_key,
    case when p_delta < 0 then 'zakhnook_available' else null end,
    case when p_delta > 0 then 'zakhnook_available' else 'sold_or_removed' end,
    'warehouse_correction', v_variant.id
  );

  return jsonb_build_object('variant_id', v_variant.id, 'previous_quantity', v_variant.quantity, 'new_quantity', v_new_quantity, 'replayed', false);
end;
$$;

revoke all on function public.apply_warehouse_stock_correction(uuid, uuid, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_warehouse_stock_correction(uuid, uuid, integer, text, text, text)
  to service_role;

-- brand_stock_quantity / set_warehouse_brand_stock â€” deprecated, not
-- removed. Kept fully functional (Codex's concurrent Brand Portal
-- Inventory UI may already call it) while new development is pointed at
-- the ledger-backed "declare a shipment" flow (request_warehouse_transfer)
-- instead. See this branch's final report for the open decision on when to
-- fully retire it.
comment on column public.product_variants.brand_stock_quantity is
  'DEPRECATED (kept functional for backward compatibility) â€” a partner brand''s own declared "stock ready to ship" count, only ever moved by request_warehouse_transfer/receive. Never read by checkout/storefront. Prefer the warehouse-document flow (request_warehouse_transfer) for new development; do not build new features that treat this as an arbitrarily-editable total.';
comment on function public.set_warehouse_brand_stock(uuid, uuid, jsonb) is
  'DEPRECATED (kept functional for backward compatibility) â€” lets a partner brand freely overwrite its own declared brand_stock_quantity. Prefer request_warehouse_transfer (declare what is actually being shipped) for new development.';

;
