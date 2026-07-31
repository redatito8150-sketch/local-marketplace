-- join-as-a-brand/apply rework: Products & operations step now asks the
-- applicant's single most important operational question directly —
-- whether they'll handle their own packaging/fulfillment or partner with
-- Mahaly to handle packaging, shipping, and storage for them — replacing
-- the old manufacturing_model/fulfillment_model/shipping_coverage_option/
-- inventory_model fields (left in place untouched for existing submitted
-- applications, same "document divergence, don't silently merge" precedent
-- as the rest of this table; new writes just stop populating them).
--
-- returns_policy_details is a free-text companion to the existing
-- returns_policy fixed choice, so an applicant can spell out their exact
-- return/exchange terms instead of being limited to one of four buckets.
alter table brand_applications
  add column if not exists fulfillment_responsibility text,
  add column if not exists returns_policy_details text;

alter table brand_applications
  add constraint brand_applications_fulfillment_responsibility_check
    check (fulfillment_responsibility is null or fulfillment_responsibility in ('brand_handles', 'mahaly_handles'));
