-- Brand application form rework, part 2 (join-as-a-brand/apply Step 4 +
-- Step 2 "Business Size"): several fields move from free text / booleans /
-- unbounded numbers to fixed-choice values. Every change here is additive —
-- new nullable columns with CHECK constraints on the new columns only. The
-- old columns (product_price_range, products_manufactured_by_brand,
-- made_to_order, avg_preparation_time, shipping_coverage,
-- return_exchange_available, inventory_status, approx_product_count,
-- approx_monthly_orders) are left in place, untouched, so existing
-- submitted applications keep their original data — new writes just stop
-- populating them. Same "document divergence, don't silently merge"
-- precedent as sales_channels/sales_channels_list and the other pairs
-- already in this table.

alter table brand_applications
  -- Step 4 — price range (EGP), replacing free-text product_price_range.
  add column if not exists price_min numeric(10, 2),
  add column if not exists price_max numeric(10, 2),

  -- Step 4 — manufacturing model, replacing boolean products_manufactured_by_brand.
  add column if not exists manufacturing_model text,

  -- Step 4 — fulfillment model, replacing boolean made_to_order.
  add column if not exists fulfillment_model text,

  -- Step 4 — preparation time as a fixed range, replacing free-text avg_preparation_time.
  add column if not exists avg_preparation_time_range text,

  -- Step 4 — shipping coverage option + governorate list (only meaningful
  -- when shipping_coverage_option = 'selected_governorates'), replacing
  -- free-text shipping_coverage.
  add column if not exists shipping_coverage_option text,
  add column if not exists shipping_governorates text[] not null default '{}',

  -- Step 4 — returns policy, replacing boolean return_exchange_available.
  add column if not exists returns_policy text,

  -- Step 4 — inventory model, multi-select, replacing free-text inventory_status.
  add column if not exists inventory_model text[] not null default '{}',

  -- Step 2 "Business Size" — fixed range buckets, replacing numeric
  -- approx_product_count and free-text approx_monthly_orders.
  add column if not exists approx_product_count_range text,
  add column if not exists approx_monthly_orders_range text;

-- CHECK constraints on the brand-new columns only (nothing pre-existing to
-- violate them) — the app/Zod layer is the primary enforcement everywhere
-- else in this table (e.g. product_category, sales_channels_list have no
-- DB-level CHECK either), but these are cheap extra safety since the
-- columns start empty.
alter table brand_applications
  add constraint brand_applications_manufacturing_model_check
    check (manufacturing_model is null or manufacturing_model in ('own_production', 'external_manufacturer', 'mixed')),
  add constraint brand_applications_fulfillment_model_check
    check (fulfillment_model is null or fulfillment_model in ('ready_to_ship', 'made_to_order', 'both')),
  add constraint brand_applications_avg_prep_time_range_check
    check (avg_preparation_time_range is null or avg_preparation_time_range in ('same_day', '1_2_days', '3_5_days', '6_7_days', 'more_than_week')),
  add constraint brand_applications_shipping_coverage_option_check
    check (shipping_coverage_option is null or shipping_coverage_option in ('all_egypt', 'selected_governorates', 'international')),
  add constraint brand_applications_returns_policy_check
    check (returns_policy is null or returns_policy in ('returns_and_exchanges', 'exchanges_only', 'no_returns', 'depends_on_product')),
  add constraint brand_applications_product_count_range_check
    check (approx_product_count_range is null or approx_product_count_range in ('0_20', '20_100', '100_500', '500_plus')),
  add constraint brand_applications_monthly_orders_range_check
    check (approx_monthly_orders_range is null or approx_monthly_orders_range in ('0_20', '20_100', '100_500', '500_plus')),
  add constraint brand_applications_price_min_nonneg_check
    check (price_min is null or price_min >= 0),
  add constraint brand_applications_price_max_nonneg_check
    check (price_max is null or price_max >= 0),
  add constraint brand_applications_price_min_max_check
    check (price_min is null or price_max is null or price_max >= price_min);
