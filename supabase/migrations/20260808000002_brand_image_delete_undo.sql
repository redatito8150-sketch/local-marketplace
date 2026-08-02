-- Backs the "undo" affordance on the brand profile's inline image editor
-- (hero/logo/about — see app/api/brands/[slug]/image/route.ts). The DELETE
-- handler there already never touches Storage, only clears the DB column,
-- so restoring is just writing the old URL back — this column is where the
-- one most-recently-cleared URL per field is kept so that's possible after
-- a page reload, not just within the same client session. Deliberately
-- capped at 1 entry per field (overwritten on every new delete, never
-- appended to) — a full undo history was explicitly not wanted, to avoid
-- the column growing unbounded.
alter table brands add column if not exists deleted_image_backups jsonb not null default '{}';
