-- Two follow-up refinements to the same-day About-page work:
--   1. founder_names (text[], added in 20260808000003) becomes founders
--      (jsonb [{ name, title }]) — each founder now has their own title
--      ("Founder", "Co-Founder", "Creative Director", ...), not a fixed
--      "Founder" label glued onto every name, and the list is owner-
--      orderable (see components/brand/FoundersEditor.tsx).
--   2. journey_milestones entries can now carry an optional `month`
--      alongside `year` (no schema change needed there — it's jsonb — this
--      is just documenting the shape addition; see
--      app/api/brands/[slug]/inline-edit's journeyMilestones branch).
alter table brands add column if not exists founders jsonb not null default '[]';
update brands set founders = (
  select coalesce(jsonb_agg(jsonb_build_object('name', founder_name, 'title', 'Founder')), '[]'::jsonb)
  from unnest(founder_names) as founder_name
)
where founder_names is not null and array_length(founder_names, 1) > 0 and founders = '[]';
alter table brands drop column if exists founder_names;
