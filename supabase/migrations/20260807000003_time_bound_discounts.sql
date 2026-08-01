-- Replaces the manually-typed "Compare At Price" with a proper time-bound
-- discount: products.price is now always the permanent base price, and a
-- discount is just a percentage plus an optional end time (null = forever).
-- The effective/charged price is computed fresh from these two fields on
-- every read (see lib/pricing.ts) — nothing is ever written back when a
-- discount expires, so it "reverts" to the base price automatically with
-- no cron job and no admin action.
alter table products add column if not exists discount_percent numeric
  check (discount_percent is null or (discount_percent > 0 and discount_percent < 100));
alter table products add column if not exists discount_ends_at timestamptz;
alter table products drop column if exists compare_at_price;

-- Found while investigating this: place_order's current 12-param signature
-- (20260807000001_brand_partner_fulfillment_and_order_splitting.sql) never
-- got the explicit revoke/grant every prior signature change in this file
-- has (see 20260722101914_place_order_address_id.sql). Postgres defaults a
-- newly created function to EXECUTE-able by PUBLIC, so this signature may
-- currently be callable directly by any anon/authenticated client —
-- bypassing app/api/orders/route.ts's server-side price re-derivation
-- entirely and letting a caller submit an arbitrary price straight into
-- order_items. Unrelated to the discount feature itself, but the same kind
-- of price-integrity gap, so closed here rather than left open.
revoke all on function public.place_order(
  text, text, text, text, text, text, uuid, jsonb, text, uuid, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.place_order(
  text, text, text, text, text, text, uuid, jsonb, text, uuid, numeric, numeric
) to service_role;
