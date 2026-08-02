-- Replaces the About-page redesign's hardcoded/fabricated founder name and
-- "Our journey" milestones (a single real brand's name/story was hardcoded
-- by slug, and every brand showed invented stats like "10,000 pieces worn")
-- with real, owner/admin-editable columns — same inline-edit pencil system
-- as tagline/aboutDescription/storyBody (see app/api/brands/[slug]/inline-edit).
alter table brands add column if not exists founder_name text;

-- Custom timeline entries an owner/admin adds on top of the two always-real
-- computed milestones (founded_year, brands.created_at) already shown on
-- the About page — [{ year, title, description }], capped at 2 entries and
-- validated server-side in the inline-edit route, same convention as the
-- other free-form jsonb columns here (values, shop_the_look).
alter table brands add column if not exists journey_milestones jsonb not null default '[]';
