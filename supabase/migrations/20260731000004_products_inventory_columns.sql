-- ============================================================================
-- products: add the low-stock default, drop the legacy derived-summary
-- inventory columns entirely. Applied against a verified-empty products
-- table, so this is a direct change, not a backfill-then-migrate.
--
-- Inventory tracking is now unconditional for every product — the old
-- track_inventory toggle (and the untracked-inventory code branches it
-- gated) is removed, not just hidden in the UI.
-- ============================================================================
alter table products add column if not exists default_low_stock_threshold integer not null default 5
  check (default_low_stock_threshold >= 0);

alter table products drop column if exists track_inventory;
alter table products drop column if exists sizes;
alter table products drop column if exists colors;
alter table products drop column if exists unavailable_sizes;
alter table products drop column if exists in_stock;
