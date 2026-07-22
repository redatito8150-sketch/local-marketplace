-- Checkout can now optionally pass the saved address an order came from
-- (app/api/orders/route.ts, only after verifying it belongs to the
-- signed-in user). place_order gains a trailing p_address_id parameter to
-- persist that traceability link on the order row — the authoritative
-- shipping_* snapshot columns are unchanged, this is additive only.
--
-- Adding a parameter changes place_order's signature, so the old 9-arg
-- overload is dropped explicitly rather than left orphaned alongside the
-- new one.
drop function if exists public.place_order(text, text, text, text, text, text, uuid, jsonb, text);

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
  v_track_inventory boolean;
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
      select track_inventory into v_track_inventory
      from products
      where id = v_item ->> 'product_id';

      if coalesce(v_track_inventory, true) then
        update product_variants
        set quantity = quantity - v_quantity, updated_at = now()
        where id = v_variant_id
          and quantity >= v_quantity
          and availability_status = 'available';

        get diagnostics v_updated = row_count;
        if v_updated = 0 then
          raise exception 'INSUFFICIENT_STOCK: %', v_item ->> 'name';
        end if;
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

revoke all on function public.place_order(text, text, text, text, text, text, uuid, jsonb, text, uuid)
  from public;
revoke all on function public.place_order(text, text, text, text, text, text, uuid, jsonb, text, uuid)
  from anon, authenticated;
grant execute on function public.place_order(text, text, text, text, text, text, uuid, jsonb, text, uuid)
  to service_role;
