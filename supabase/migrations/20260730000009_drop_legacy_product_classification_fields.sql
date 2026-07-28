-- Drops the legacy product classification fields entirely, now that:
--   - audience (20260730000003) fully replaces category + is_unisex
--   - product_type_id (20260728000001, required as of 20260730000008)
--     fully replaces product_category + product_type
--   - collection_id (20260730000005) fully replaces the free-text
--     collection column
-- and every application read/write path has been updated to use only the
-- new columns (verified via `npx tsc --noEmit` finding zero remaining
-- references before this migration was written). Run this LAST, after
-- 20260730000008 — never keep both systems live at once "just in case".
alter table products drop constraint if exists products_category_check;
drop index if exists products_category_idx;

alter table products drop column if exists category;
alter table products drop column if exists product_category;
alter table products drop column if exists product_type;
alter table products drop column if exists collection;
alter table products drop column if exists is_unisex;
