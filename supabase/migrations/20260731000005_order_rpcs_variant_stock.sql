-- ============================================================================
-- place_order() / cancel_order() — adjusted for Inventory & Variants, not
-- redesigned. The existing atomic, row-locked, concurrency-safe stock
-- update pattern (`update ... where quantity >= v_qty and <status> =
-- <active-value>`, checked via row count) is kept exactly as-is; only the
-- guard column/value changes (availability_status='available' ->
-- selling_status='active') and the `track_inventory` conditional is
-- removed, since every product now tracks inventory unconditionally.
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
  p_address_id uuid default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_subtotal_usd numeric(10, 2) := 0;
  v_subtotal_egp numeric(10, 2) := 0;
  v_item jsonb;
  v_variant_id uuid;
  v_quantity int;
  v_price numeric(10, 2);
  v_currency text;
  v_line_total numeric(10, 2);
  v_updated int;
  v_attempt int := 0;
  v_coupon coupons%rowtype;
  v_discount_egp numeric(10, 2) := 0;
  v_coupon_code text;
begin
  loop
    v_order_number := 'LC-' || floor(100000 + random() * 900000)::text;
    begin
      insert into orders (
        order_number, user_id, shipping_name, shipping_email, shipping_phone,
        shipping_address, shipping_city, shipping_governorate, subtotal_usd, subtotal_egp,
        address_id
      ) values (
        v_order_number, p_user_id, p_shipping_name, p_shipping_email, p_shipping_phone,
        p_shipping_address, p_shipping_city, p_shipping_governorate, 0, 0,
        p_address_id
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
      nullif(v_item ->> 'brand_slug', ''), v_price, v_currency, v_item ->> 'size',
      nullif(v_item ->> 'color', ''), v_quantity, v_item ->> 'image'
    );

    v_line_total := v_price * v_quantity;
    if v_currency = 'EGP' then
      v_subtotal_egp := v_subtotal_egp + v_line_total;
    else
      v_subtotal_usd := v_subtotal_usd + v_line_total;
    end if;
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
      v_discount_egp := round(v_subtotal_egp * v_coupon.discount_value / 100, 2);
    else
      v_discount_egp := least(v_coupon.discount_value, v_subtotal_egp);
    end if;

    update coupons set used_count = used_count + 1 where code = v_coupon_code;
  end if;

  update orders
  set subtotal_usd = v_subtotal_usd,
      subtotal_egp = v_subtotal_egp,
      coupon_code = v_coupon_code,
      discount_amount_egp = v_discount_egp
  where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'discount_amount_egp', v_discount_egp
  );
end;
$$;

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

  return jsonb_build_object('order_id', p_order_id, 'restocked_variants', v_restocked);
end;
$$;
