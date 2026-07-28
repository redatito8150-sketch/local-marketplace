-- Replaces "Gender" with "Audience" as the product form's source of truth.
-- Additive: the existing `category` ('women'|'men'|'kids') and `is_unisex`
-- columns are untouched and keep driving /shop/women|men|kids routing,
-- filters, and every existing display — this new `audience` column is what
-- the rebuilt product form reads/writes going forward, mapped onto
-- category/is_unisex server-side so nothing else in the app needs to change.
--
-- Deliberately nullable and with NO default — a product with no audience
-- yet (legacy data that doesn't map cleanly) stays exactly as it is
-- (still published, still visible) but the app-level validation in
-- lib/admin/productValidation.ts now requires a valid audience on every
-- future save, so it can't be re-saved/republished without one being set.
alter table products add column if not exists audience text;
alter table products drop constraint if exists products_audience_check;
alter table products add constraint products_audience_check
  check (audience is null or audience in ('men', 'women', 'unisex', 'kids_baby'));
create index if not exists idx_products_audience on products (audience);

-- Backfill from the existing category/is_unisex pair, only for rows that
-- don't already have an audience set:
--  - is_unisex = true  -> 'unisex' (regardless of which of women/men it was
--    stored under — is_unisex already means "shown under both")
--  - category = 'kids' -> 'kids_baby'
--  - category = 'women' (not unisex) -> 'women'
--  - category = 'men' (not unisex) -> 'men'
--  - category is null (a brand-only product with no shop-category) is left
--    with audience = null — genuinely ambiguous legacy data, flagged for
--    review by staying null rather than guessed at.
update products
set audience = case
  when is_unisex then 'unisex'
  when category = 'kids' then 'kids_baby'
  when category = 'women' then 'women'
  when category = 'men' then 'men'
  else null
end
where audience is null;
