-- "Other" business registration status now has a free-text follow-up so an
-- applicant who doesn't fit the four preset options can specify what their
-- actual registration status is — same pattern as applicant_role_other for
-- the "Other" applicant role (20260725000002_brand_application_role_other_and_channel_links.sql).
alter table brand_applications
  add column if not exists legal_status_other text;
