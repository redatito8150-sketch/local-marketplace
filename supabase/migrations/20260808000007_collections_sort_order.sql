-- Backs drag-to-reorder on the brand profile's Collections page (owner/
-- admin only — see components/brand/CollectionsOrderPanel.tsx) now that
-- collection *creation* is consolidated into /brand-portal/collections
-- only (components/brand/CollectionsManager.tsx moved there). The first
-- collection by sort_order is the "featured" one on the public experience
-- (components/brand/BrandCollectionsExperience treats collections[0] as
-- featured) — no separate is_featured flag needed, reordering to position
-- 0 *is* choosing the featured collection.
alter table collections add column if not exists sort_order int not null default 0;

-- Backfill using each collection's existing de-facto order (creation
-- order) so nothing already live suddenly reshuffles.
with ranked as (
  select id, row_number() over (partition by brand_id order by created_at asc) - 1 as rn
  from collections
)
update collections set sort_order = ranked.rn
from ranked
where collections.id = ranked.id;

create index if not exists idx_collections_brand_sort on collections (brand_id, sort_order);
