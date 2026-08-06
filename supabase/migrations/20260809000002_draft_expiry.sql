-- Drafts exist so a brand owner (or admin) can save incomplete work and
-- come back later — but an abandoned draft shouldn't sit around forever.
-- draft_started_at is stamped the moment a product first becomes a draft
-- (create, or a real transition into draft from another status) and
-- cleared the moment it leaves draft — lib/admin/productPersistence.ts
-- owns that logic. lib/admin/expireDrafts.ts lazily deletes any draft
-- past a 10-day window whenever the products list is loaded (no cron
-- infra in this project, so "on next read" is the enforcement point).
alter table products
  add column if not exists draft_started_at timestamptz;
