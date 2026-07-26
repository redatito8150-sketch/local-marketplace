-- The onboarding_completed_at column (20260722101916_onboarding_completed.sql)
-- was added with no backfill, so every account that existed before that
-- migration ran has it NULL — which the /account redirect effect treats as
-- "hasn't seen the add-address prompt yet," sending long-standing customers
-- through the one-time onboarding step on their next sign-in. That's a bug,
-- not the intended behavior: the prompt is meant only for brand-new
-- accounts created after this flow existed.
--
-- Safe, additive backfill: mark every account that still has it NULL as
-- already completed, using their account creation date as the completion
-- timestamp (the most accurate stand-in available — they obviously never
-- saw a prompt that didn't exist yet when they signed up). Any genuinely
-- new signup from this point forward still gets NULL and correctly sees
-- the prompt once.
update public.profiles
set onboarding_completed_at = created_at
where onboarding_completed_at is null;
