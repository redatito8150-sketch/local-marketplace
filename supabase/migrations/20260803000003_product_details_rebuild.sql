-- Product Details rebuild: structured Materials composition + Brand-level
-- Shipping & Returns policy fields (Brand policy takes priority over the
-- marketplace default; see lib/admin/shippingPolicy.ts for resolution).
--
-- Existing columns (products.material, products.fit, products.description,
-- products.details, products.care_instructions, products.shipping_returns)
-- are preserved untouched — this migration only adds new columns and
-- backfills `products.materials` deterministically from the existing
-- single `material` text column. Nothing is deleted.

-- ── Brands: minimum policy fields needed for the priority resolution ──────
alter table brands add column if not exists shipping_policy text;
alter table brands add column if not exists return_policy text;
alter table brands add column if not exists return_window_days integer;

alter table brands drop constraint if exists brands_return_window_days_check;
alter table brands add constraint brands_return_window_days_check
  check (return_window_days is null or return_window_days > 0);

comment on column brands.shipping_policy is
  'Free-text shipping policy shown on every product from this brand. Null/empty falls back to the marketplace default.';
comment on column brands.return_policy is
  'Free-text return policy shown on every product from this brand. Null/empty falls back to the marketplace default.';
comment on column brands.return_window_days is
  'Return window in days for this brand''s policy. Null falls back to the marketplace default (7 days).';

-- ── Products: structured multi-material composition ───────────────────────
alter table products add column if not exists materials jsonb not null default '[]';

comment on column products.materials is
  'Ordered array of {"material": text, "percentage": number}. Must total exactly 100 before a product can be published (see lib/admin/productValidation.ts). The legacy single `material` text column is preserved for backward compatibility and is no longer written to by the editor.';

-- Deterministic backfill: a product with a single legacy `material` value
-- and no materials recorded yet gets exactly one 100% entry. Products with
-- no material set, or that already have a materials array, are untouched.
update products
set materials = jsonb_build_array(jsonb_build_object('material', material, 'percentage', 100))
where material is not null
  and btrim(material) <> ''
  and (materials is null or materials = '[]'::jsonb);
