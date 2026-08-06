-- Per-variant discount % (e.g. discount just one color, not the whole
-- product) — mutually exclusive with products.discount_percent at the
-- application layer (lib/admin/productValidation.ts), enforced here only
-- as a basic range check, same pattern as the product-level column
-- (20260807000003_time_bound_discounts.sql).
alter table product_variants
  add column if not exists variant_discount_percent numeric
    check (variant_discount_percent is null or (variant_discount_percent > 0 and variant_discount_percent < 100));

-- create_variant_with_opening_stock's signature changes (new
-- p_variant_discount_percent param), so the old one must be dropped first —
-- create or replace only allows appending params, not inserting one
-- between existing ones the way the JS call site groups it logically
-- alongside p_variant_price.
drop function if exists public.create_variant_with_opening_stock(
  text,text,text,integer,numeric,integer,text,uuid[],uuid,text
);

create function public.create_variant_with_opening_stock(
  p_product_id text,
  p_sku text,
  p_combo_key text,
  p_opening_stock integer,
  p_variant_price numeric,
  p_variant_discount_percent numeric,
  p_low_stock_threshold_override integer,
  p_selling_status text,
  p_option_value_ids uuid[],
  p_actor_id uuid,
  p_operation_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_variant_id uuid;
  v_brand_id uuid;
begin
  if p_opening_stock < 0 then
    raise exception 'Opening Stock cannot be negative';
  end if;

  select brand_id into v_brand_id
  from public.products where id = p_product_id for update;
  if v_brand_id is null then raise exception 'Product not found'; end if;

  select id into v_variant_id
  from public.product_variants
  where product_id = p_product_id and combo_key = p_combo_key
  order by is_archived asc, created_at asc
  limit 1;

  if v_variant_id is not null then
    return v_variant_id;
  end if;

  insert into public.product_variants (
    product_id, sku, quantity, variant_price, variant_discount_percent,
    low_stock_threshold_override, selling_status, combo_key
  ) values (
    p_product_id, p_sku, p_opening_stock, p_variant_price, p_variant_discount_percent,
    p_low_stock_threshold_override, p_selling_status, p_combo_key
  ) returning id into v_variant_id;

  if coalesce(array_length(p_option_value_ids, 1), 0) > 0 then
    insert into public.product_variant_values (variant_id, option_value_id)
    select v_variant_id, unnest(p_option_value_ids);
  end if;

  insert into public.inventory_movements (
    variant_id, product_id, brand_id, previous_quantity, quantity_delta,
    new_quantity, movement_type, reason, created_by, source,
    source_operation_key
  ) values (
    v_variant_id, p_product_id, v_brand_id, 0, p_opening_stock,
    p_opening_stock, 'opening_balance', 'Opening Stock', p_actor_id,
    'product_editor', p_operation_key
  ) on conflict (variant_id, source_operation_key) do nothing;

  return v_variant_id;
end;
$$;

revoke all on function public.create_variant_with_opening_stock(
  text,text,text,integer,numeric,numeric,integer,text,uuid[],uuid,text
) from public, anon, authenticated;
grant execute on function public.create_variant_with_opening_stock(
  text,text,text,integer,numeric,numeric,integer,text,uuid[],uuid,text
) to service_role;
