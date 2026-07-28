-- Audience is now the sole source of truth for who a product is for,
-- replacing the old Gender ("category" 'women'|'men'|'kids' + "is_unisex")
-- pair entirely. Required on every product — no null/empty option, no
-- automatic "Unisex" fallback. Must run AFTER
-- 20260730000001_reset_test_catalog_data.sql (products is empty at this
-- point — a NOT NULL add on a populated table would fail, which is
-- intentional: it means the reset hasn't been run yet).
alter table products add column if not exists audience text;
alter table products alter column audience set not null;
alter table products drop constraint if exists products_audience_check;
alter table products add constraint products_audience_check
  check (audience in ('men', 'women', 'unisex', 'kids_baby'));
create index if not exists idx_products_audience on products (audience);
