-- Real, per-brand sponsorship — replaces two things that were previously
-- hardcoded/manually-curated with no connection to the real brands table:
-- content/navigation.ts's FEATURED_BRANDS array (mega menu, stale/deleted
-- brand slugs) and the featured_brand_and_sponsored site_content row (the
-- homepage's old hand-picked "Sponsored" section). An admin now just marks
-- a brand Sponsored and picks which placement(s) it should appear in;
-- everything else is computed live (see lib/data/brands.ts's
-- getFeaturedBrandsForMenu/getSponsoredBrandsForPlacement).
alter table brands add column if not exists is_sponsored boolean not null default false;
alter table brands add column if not exists sponsored_placements text[] not null default '{}';
alter table brands add column if not exists sponsored_order int;

-- Allowed placement values — enforced here rather than only at the app
-- layer, since this array is read directly by `@>`/`&&` queries and a
-- typo'd value would just silently never match anything.
alter table brands drop constraint if exists brands_sponsored_placements_check;
alter table brands add constraint brands_sponsored_placements_check
  check (sponsored_placements <@ array['homepage_banner', 'mega_menu_banner', 'featured_brands_first']::text[]);

create index if not exists idx_brands_sponsored_placements on brands using gin (sponsored_placements);
