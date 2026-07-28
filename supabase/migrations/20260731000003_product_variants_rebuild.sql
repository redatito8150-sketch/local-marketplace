-- ============================================================================
-- product_variants rebuild for Inventory & Variants. Applied against a
-- verified-empty product_variants table (0 rows live), so every change
-- below is a direct alter — no backfill needed.
-- ============================================================================

-- Price Override -> Variant Price (same "final price, not a delta"
-- semantics as before — lib/audience.ts-style rename, not a behavior
-- change; resolveProductPrice already treats it as the complete price).
alter table product_variants rename column price_override to variant_price;
alter table product_variants add constraint product_variants_variant_price_check
  check (variant_price is null or variant_price >= 0);

-- availability_status -> selling_status. Manually controlled by the
-- brand/admin; automatic Stock Status (in/low/out) is derived separately
-- (see the shared calculation used by every interface, not stored here).
alter table product_variants rename column availability_status to selling_status;
alter table product_variants drop constraint if exists product_variants_availability_status_check;
alter table product_variants alter column selling_status set default 'active';
alter table product_variants add constraint product_variants_selling_status_check
  check (selling_status in ('active', 'paused', 'discontinued'));

-- Per-variant low-stock override — nullable; null means "use the
-- product's own default_low_stock_threshold" (added in the next
-- migration). Replaces the old required, product-default-unaware
-- low_stock_threshold.
alter table product_variants add column if not exists low_stock_threshold_override int
  check (low_stock_threshold_override is null or low_stock_threshold_override >= 0);
alter table product_variants drop column if exists low_stock_threshold;

-- color/size (free text) are replaced entirely by product_variant_values
-- (stable option_value ids, up to 3 per variant, not just these two axes).
alter table product_variants drop column if exists color;
alter table product_variants drop column if exists size;

-- combo_key is a deterministic, server-computed key over a variant's
-- sorted option_value ids (empty string for a product with no
-- configurable options — its one default variant) — the DB-level backstop
-- for "unique variant combination per product", since a plain UNIQUE
-- constraint can't express "unique over a set of rows in a join table".
alter table product_variants add column if not exists combo_key text not null default '';
create unique index if not exists product_variants_product_combo_key
  on product_variants (product_id, combo_key);

-- Archived (not hard-deleted) once referenced by real history — see
-- product_variants_archived_ok below for exactly which references block a
-- hard delete.
alter table product_variants add column if not exists is_archived boolean not null default false;

-- SKU is always server-generated now (never client-supplied), required,
-- unique, and immutable after creation.
alter table product_variants alter column sku set not null;
alter table product_variants drop constraint if exists product_variants_sku_key;
alter table product_variants add constraint product_variants_sku_key unique (sku);

alter table product_variants drop constraint if exists product_variants_quantity_check;
alter table product_variants add constraint product_variants_quantity_check check (quantity >= 0);

-- A variant referenced by order history, inventory movements, or
-- reservations must never be hard-deleted — this project doesn't have
-- separate inventory-movement/reservation tables yet, so the one real
-- reference to guard today is order_items.variant_id (already `on delete
-- set null` — safe for the FK, but the app layer must still archive
-- rather than delete a variant with order history; see
-- lib/admin/variantPersistence.ts).
