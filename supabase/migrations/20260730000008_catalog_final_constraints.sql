-- ============================================================================
-- Final catalog constraints — added only now that the reset
-- (20260730000001) has emptied `products` down to zero rows and the
-- surviving brand ('mahaly') has been given a valid sku_prefix below, so
-- every NOT NULL/CHECK/UNIQUE constraint here can be added safely, with
-- Postgres itself verifying no violating row exists rather than trusting
-- application code.
-- ============================================================================

-- mahaly (the one brand preserved by the reset) predates sku_prefix and
-- has none yet — give it one deterministically (its own name) so the
-- NOT NULL constraint below can be added without leaving a real brand in
-- a broken state.
update brands set sku_prefix = 'MAHALY' where slug = 'mahaly' and sku_prefix is null;

alter table brands alter column sku_prefix set not null;

-- ============================================================================
-- PRODUCTS — brand_id, sku, audience, product_type_id are all required.
-- collection_id stays nullable (a product need not belong to a collection).
-- ============================================================================
alter table products alter column brand_id set not null;
alter table products alter column audience set not null;
alter table products alter column product_type_id set not null;

do $$
begin
  if exists (
    select 1 from products group by sku having count(*) > 1
  ) then
    raise exception 'Duplicate products.sku values still exist — resolve them before adding the unique constraint';
  end if;
end $$;

alter table products drop constraint if exists products_sku_key;
alter table products add constraint products_sku_key unique (sku);

-- product_type_id must resolve to a Level 3 (Product Type) node, and any
-- *new* selection must be an active one — enforced here, not only in
-- TypeScript, so this can never be bypassed by a direct write.
create or replace function public.enforce_product_type_id_is_level_3()
returns trigger
language plpgsql
as $$
declare
  v_level int;
  v_is_active boolean;
begin
  select level, is_active into v_level, v_is_active
  from taxonomy_nodes where id = new.product_type_id;

  if v_level is null then
    raise exception 'product_type_id % does not reference an existing taxonomy node', new.product_type_id;
  end if;
  if v_level <> 3 then
    raise exception 'product_type_id % must reference a Level 3 (Product Type) taxonomy node, got level %', new.product_type_id, v_level;
  end if;
  if not v_is_active then
    raise exception 'product_type_id % refers to an inactive taxonomy node and cannot be selected', new.product_type_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_enforce_product_type_id_is_level_3 on products;
create trigger trigger_enforce_product_type_id_is_level_3
  before insert or update of product_type_id on products
  for each row execute function public.enforce_product_type_id_is_level_3();

-- ============================================================================
-- TAXONOMY_NODES — indexes for is_active/sort_order (parent_id and level
-- already indexed since 20260728000001).
-- ============================================================================
create index if not exists idx_taxonomy_nodes_is_active on taxonomy_nodes (is_active);
create index if not exists idx_taxonomy_nodes_sort_order on taxonomy_nodes (sort_order);
