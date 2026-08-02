-- Extends the About-page redesign so the brand controls more of what was
-- previously fixed copy on app/brands/[slug]/about/page.tsx:
--   - about_headline: the "Designed in {city}. Made for everywhere." H1 —
--     free text now, still defaults to that same line when empty.
--   - about_quote: the pull-quote ("We started {brand} to make everyday
--     pieces feel personal again.") — same deal.
-- aboutDescription itself (about_description, already existed) becomes the
-- single rich-text field for the whole intro on this page — the separate
-- "sea breeze" storyBody fallback paragraph is retired from this page only;
-- story_body itself is untouched (still used by the admin BrandForm /
-- brand-portal / mobile app, out of scope here).
alter table brands add column if not exists about_headline text;
alter table brands add column if not exists about_quote text;

-- Multiple founders, replacing the single founder_name column added in
-- 20260808000001 (shipped same day, before any real owner had a chance to
-- fill it in) — any single name already entered is preserved into the new
-- array rather than silently dropped.
alter table brands add column if not exists founder_names text[] not null default '{}';
update brands set founder_names = array[founder_name]
  where founder_name is not null and founder_name <> '' and founder_names = '{}';
alter table brands drop column if exists founder_name;
