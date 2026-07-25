-- Brand application form rework (join-as-a-brand/apply):
-- 1. "Your role at the brand" gets a free-text companion field for when the
--    applicant picks "Other" — applicant_role itself stays the fixed enum,
--    this just holds what they typed.
-- 2. Sales channels move from three separate free-text fields (Instagram
--    username, a single website_url, a comma-separated other-social list)
--    to one {channel: link} map, since the new form collects one link per
--    selected channel (Instagram, TikTok, Website, ...) instead of asking
--    for the same information three different ways. website_url and
--    other_social_urls are left in place (existing legacy rows still read
--    from them) — new rows populate sales_channel_links instead, same
--    "document divergence, don't silently merge" precedent as
--    sales_channels/sales_channels_list in the previous migration.
alter table brand_applications
  add column if not exists applicant_role_other text,
  add column if not exists sales_channel_links jsonb not null default '{}'::jsonb;
