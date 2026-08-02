-- Extends the `collections` table (20260730000005_collections_and_sku_by_
-- brand_id.sql) so a brand can manage far more of its public Collections
-- page (/brands/[slug]/collections) directly from that page, the same
-- inline-edit pencil system used on the About page — see
-- app/api/brands/[slug]/collections/**.
--
--   - cover_image_urls: more than one cover photo per collection, shown as
--     an auto-advancing (then manually overridable) slideshow. Any
--     existing single cover_image_url is carried over as this array's
--     first (only) entry; cover_image_url itself is left in place
--     untouched (still read by anything not yet updated to the array).
--   - tagline: a short editable badge shown on the collection card,
--     replacing the previously auto-derived "N pieces" / month-year text.
--   - visible_from: optional scheduled reveal — a collection can be
--     created and fully set up before it's actually shown to shoppers.
alter table collections add column if not exists cover_image_urls text[] not null default '{}';
update collections set cover_image_urls = array[cover_image_url]
  where cover_image_url is not null and cover_image_urls = '{}';
alter table collections add column if not exists tagline text;
alter table collections add column if not exists visible_from timestamptz;

-- The public read policy now also respects visible_from — a collection
-- otherwise active+published still isn't shown until that moment arrives.
-- getPublicCollectionsForBrand/getPublicCollectionBySlug (lib/data/
-- brandCollections.ts) mirror this exact condition at the app layer too.
drop policy if exists "Published active collections are publicly readable" on collections;
create policy "Published active collections are publicly readable"
  on collections for select
  using (is_active = true and published_at is not null and (visible_from is null or visible_from <= now()));

-- The Collections page's own editable headline ("Collections,
-- reimagined.") — same fallback-when-empty pattern as about_headline/
-- about_quote on the About page.
alter table brands add column if not exists collections_page_title text;
