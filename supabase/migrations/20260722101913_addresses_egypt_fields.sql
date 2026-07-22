-- Extends the addresses table (added in 20260722101912) with the fields an
-- Egyptian delivery actually needs beyond the original MVP shape: a
-- constrained label instead of free text, and building/floor/apartment/
-- landmark/instructions broken out of the single address_line field so
-- couriers get a structured address. postal_code is genuinely optional —
-- the current delivery workflow doesn't use it.

alter table public.addresses add column if not exists building_number text;
alter table public.addresses add column if not exists floor text;
alter table public.addresses add column if not exists apartment text;
alter table public.addresses add column if not exists landmark text;
alter table public.addresses add column if not exists delivery_instructions text;
alter table public.addresses add column if not exists postal_code text;

-- Existing rows may have any free-text label from before this constraint
-- existed; fold anything unrecognized into "Other" rather than failing the
-- migration on old data.
update public.addresses
  set label = 'Other'
  where label not in ('Home', 'Work', 'Other');

alter table public.addresses drop constraint if exists addresses_label_check;
alter table public.addresses add constraint addresses_label_check
  check (label in ('Home', 'Work', 'Other'));
