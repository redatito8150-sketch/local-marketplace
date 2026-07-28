-- ============================================================================
-- Reset test catalog data (dev/staging only)
--
-- Explicitly authorized, one-time destructive reset of the current
-- product/brand/variant/collection catalog, which is confirmed development
-- seed/test data, ahead of rebuilding the catalog on the brand_id
-- architecture (see the migrations that follow this one).
--
-- Connected project verified before writing this migration: the dev/staging
-- Supabase project at https://kdrrzrboibwyxzrfwsgu.supabase.co (the only
-- project referenced by this repo's .env.local — there is no separate
-- "production" Supabase project configured anywhere in this codebase; the
-- payment gateway is still unimplemented per README/CLAUDE.md, confirming
-- this project has not gone live). Live row counts at the time of writing:
-- products=31, brands=10, product_variants=197, orders=3, order_items=3.
--
-- EXCLUDED — not test data. Brand 'mahaly' is owned by a real brand-owner
-- account (salsa2810@icloud.com), created by a real, approved
-- brand_applications row (id 698d8b93-..., status 'converted_to_brand',
-- applicant_user_id matches the same account). It currently has 0
-- products, so excluding it loses no catalog data; only its account/brand
-- shell survives the reset, per the explicit instruction not to delete a
-- brand-owner account/relationship unless it is confirmed disposable.
--
-- NOT touched at all (not catalog data, and not part of what was asked):
--   - orders / order_items: transactional customer records, not catalog
--     data. order_items.product_id and .variant_id are both nullable and
--     already `on delete set null` (see supabase/schema.sql) — historical
--     order rows keep their own denormalized name/brand/price/image
--     snapshot regardless of catalog deletions, so nothing here needs
--     manual cleanup for referential integrity.
--   - profiles / auth.users: no account is deleted by this migration.
--   - brand_applications: kept as a historical record. None of the 9
--     brands removed below are referenced by any live
--     brand_applications.approved_brand_id (only the preserved 'mahaly'
--     row is), so no nullification is required either.
--   - notifications / audit_logs: both store free-text entity references
--     (type/title/body, entity_type/entity_id), not real foreign keys to
--     products/brands, so nothing here can become an orphaned FK. Also
--     left alone by design — audit_logs is documented in CLAUDE.md as an
--     intentionally permanent, unbounded record; notifications is already
--     capped at 50 rows by its own prune trigger.
--
-- Dependency order below was determined by inspecting the live schema
-- directly (supabase/schema.sql, supabase/migrations/20260726000003_
-- reviews_system.sql, and a live PostgREST OpenAPI introspection for the
-- four tables — wishlists, cart_items, recently_viewed, brand_follows —
-- that exist in the live database but have no CREATE TABLE tracked
-- anywhere in this repo's migration history):
--   products.id            <- product_variants.product_id   (cascade)
--   products.id            <- reviews.product_id             (restrict)
--   products.id            <- wishlists.product_id           (live FK)
--   products.id            <- cart_items.product_id          (live FK)
--   products.id            <- recently_viewed.product_id     (live FK)
--   brands.slug             <- products.brand_slug            (set null)
--   brands.slug             <- brand_follows.brand_slug       (live FK)
--   brands.slug             <- brand_staff.brand_slug         (cascade)
--   reviews.id              <- review_images/review_replies/
--                               review_helpful_votes/review_reports (cascade)
-- Deleting the leaf-most rows first (reviews, wishlists, cart_items,
-- recently_viewed, brand_follows) before products, and products before
-- brands, is correct regardless of which of those live/untracked FKs are
-- RESTRICT vs CASCADE vs SET NULL — this ordering never depends on that.
--
-- Wrapped in a single transaction: any failure rolls back the entire
-- reset, never a partial one.
-- ============================================================================

begin;

-- 1. Reviews on test products — reviews.product_id/.order_item_id are
--    `on delete restrict`, so these must go before products. Cascades
--    review_images/review_replies/review_helpful_votes/review_reports
--    automatically via their own `on delete cascade` from reviews.id.
delete from reviews
where product_id in (
  select id from products where brand_slug is distinct from 'mahaly'
);

-- 2. Per-user references to test products (live FKs, untracked in any
--    migration file — confirmed via live introspection).
delete from wishlists
where product_id in (
  select id from products where brand_slug is distinct from 'mahaly'
);

delete from cart_items
where product_id in (
  select id from products where brand_slug is distinct from 'mahaly'
);

delete from recently_viewed
where product_id in (
  select id from products where brand_slug is distinct from 'mahaly'
);

-- 3. Follows of test brands (live FK, same untracked situation).
delete from brand_follows
where brand_slug in (
  select slug from brands where slug is distinct from 'mahaly'
);

-- 4. Variants of test products. Already `on delete cascade` from
--    products, but deleted explicitly here so the reset doesn't rely on
--    cascade behavior to reach a verifiable zero.
delete from product_variants
where product_id in (
  select id from products where brand_slug is distinct from 'mahaly'
);

-- 5. Test products themselves.
delete from products where brand_slug is distinct from 'mahaly';

-- 6. Test brands themselves. brand_staff.brand_slug is `on delete
--    cascade` (table is empty live, nothing to clean up); no live
--    brand_applications row references any of these 9 slugs.
delete from brands where slug is distinct from 'mahaly';

commit;

-- ============================================================================
-- Verification queries (run manually after applying this migration):
--
--   select count(*) from products;                    -- expect 0
--   select count(*) from product_variants;             -- expect 0
--   select count(*) from reviews;                      -- expect 0
--   select count(*) from wishlists;                    -- expect 0
--   select count(*) from cart_items;                   -- expect 0
--   select count(*) from recently_viewed;               -- expect 0
--   select count(*) from brand_follows;                 -- expect 0
--   select slug, name, owner_user_id from brands;       -- expect only 'mahaly'
--   select count(*) from orders;                        -- unchanged (3)
--   select count(*) from order_items;                   -- unchanged (3)
--   select count(*) from order_items where product_id is not null; -- expect 0
--                                                        -- (their products were just deleted, set null via FK)
-- ============================================================================
