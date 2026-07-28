-- Run this ONLY after the previous 3 taxonomy/audience/sku/collections
-- migrations, and only once you've confirmed there are no duplicate SKUs
-- left in `products` — per the task's own "add constraints only after data
-- has been normalized" rule, this is deliberately a separate, later step
-- rather than bundled into the additive migrations above.
--
-- Check for duplicates first:
--
--   select sku, array_agg(id) as product_ids, count(*)
--   from products
--   group by sku
--   having count(*) > 1;
--
-- If that returns any rows, resolve them manually (rename the older/lower-
-- priority product's sku, e.g. append "-DUP-<short id>") before running the
-- statement below — a duplicate must never be silently overwritten.
do $$
begin
  if exists (
    select 1 from products group by sku having count(*) > 1
  ) then
    raise exception 'Duplicate products.sku values still exist — resolve them before adding the unique constraint (see the query in this migration''s header comment)';
  end if;
end $$;

alter table products drop constraint if exists products_sku_key;
alter table products add constraint products_sku_key unique (sku);
