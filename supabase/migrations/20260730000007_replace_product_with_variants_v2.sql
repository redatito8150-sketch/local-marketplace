-- Rewrites replace_product_with_variants (the atomic product-edit +
-- variant-replace RPC used by the admin/brand-portal product edit routes)
-- for the brand_id architecture:
--   - brand_name / brand_slug / brand_id are no longer part of the SET
--     list at all — a product's brand is immutable after creation, so
--     this edit path structurally cannot change it (not just app-level
--     validation). brand_slug/brand_name stay in sync with brand_id via
--     the trigger from 20260730000004, which only fires on an actual
--     brand_id change — never on an ordinary edit.
--   - sku is likewise dropped from the SET list — generated once on
--     insert, never regenerated on update, enforced structurally here too.
--   - category / product_category / product_type / collection / is_unisex
--     (legacy classification fields) are dropped; audience,
--     product_type_id, collection_id take their place.
create or replace function public.replace_product_with_variants(
  p_product_id text,
  p_product jsonb,
  p_variants jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_product) <> 'object'
     or jsonb_typeof(p_variants) <> 'array' then
    raise exception 'Invalid product payload';
  end if;

  update public.products
  set
    name = p_product->>'name',
    audience = p_product->>'audience',
    product_type_id = nullif(p_product->>'product_type_id', '')::uuid,
    collection_id = nullif(p_product->>'collection_id', '')::uuid,
    material = nullif(p_product->>'material', ''),
    fit = nullif(p_product->>'fit', ''),
    price = (p_product->>'price')::numeric,
    compare_at_price = nullif(p_product->>'compare_at_price', '')::numeric,
    currency = p_product->>'currency',
    image = p_product->>'image',
    images = array(select jsonb_array_elements_text(p_product->'images')),
    colors = p_product->'colors',
    sizes = array(select jsonb_array_elements_text(p_product->'sizes')),
    description = p_product->>'description',
    details = array(select jsonb_array_elements_text(p_product->'details')),
    care_instructions = array(select jsonb_array_elements_text(p_product->'care_instructions')),
    shipping_returns = p_product->>'shipping_returns',
    model_height = nullif(p_product->>'model_height', ''),
    model_wearing = nullif(p_product->>'model_wearing', ''),
    in_stock = (p_product->>'in_stock')::boolean,
    is_new = (p_product->>'is_new')::boolean,
    unavailable_sizes = array(select jsonb_array_elements_text(p_product->'unavailable_sizes')),
    track_inventory = (p_product->>'track_inventory')::boolean,
    featured = case when p_product ? 'featured' then (p_product->>'featured')::boolean else featured end,
    status = p_product->>'status',
    publish_date = nullif(p_product->>'publish_date', '')::timestamptz,
    submitted_by = case when p_product ? 'submitted_by' then nullif(p_product->>'submitted_by', '')::uuid else submitted_by end,
    pending_changes = case
      when p_product ? 'pending_changes' and p_product->'pending_changes' = 'null'::jsonb then null
      when p_product ? 'pending_changes' then p_product->'pending_changes'
      else pending_changes
    end,
    review_notes = case when p_product ? 'review_notes' then p_product->>'review_notes' else review_notes end
  where id = p_product_id;

  if not found then raise exception 'Product not found'; end if;

  delete from public.product_variants where product_id = p_product_id;
  insert into public.product_variants (
    product_id, color, size, sku, quantity, low_stock_threshold,
    price_override, availability_status
  )
  select p_product_id, nullif(v.color, ''), nullif(v.size, ''), nullif(v.sku, ''),
    v.quantity, v.low_stock_threshold, v.price_override, v.availability_status
  from jsonb_to_recordset(p_variants) as v(
    color text, size text, sku text, quantity int, low_stock_threshold int,
    price_override numeric, availability_status text
  );
end;
$$;

revoke all on function public.replace_product_with_variants(text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_product_with_variants(text, jsonb, jsonb)
  to service_role;
