-- The Collections page's expanded-collection chrome text ("The edit" /
-- "Pieces from {name}" in components/brand/BrandCollectionsExperience) —
-- owner/admin-editable now, same fallback-when-empty pattern as every
-- other about_*/collections_page_title field.
alter table brands add column if not exists collections_detail_eyebrow text;
alter table brands add column if not exists collections_detail_heading text;
