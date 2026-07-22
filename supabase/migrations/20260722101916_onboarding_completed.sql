-- Tracks whether a customer has seen the post-registration "add a delivery
-- address / skip for now" onboarding step (app/onboarding/add-address),
-- so it only ever shows once per account rather than nagging on every
-- sign-in — null means "not shown yet."
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
