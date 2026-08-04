-- Restores the system Color/Size option types + their standard values —
-- deleted (along with every brand-specific option_type/option_value, as
-- intended) by 20260806000004_full_reset_to_clean_test_state.sql's
-- `delete from option_types` / `delete from option_values`. That reset
-- correctly cleared test/catalog data, but the system Color and Size
-- option types are baseline platform configuration (every product's
-- Variant Matrix depends on them existing), not test data — the reset
-- migration never re-seeded them afterward, which is what's now surfacing
-- as "System Color and Size option types were not found" in the Product
-- Editor.
--
-- Verbatim re-run of the three SEED blocks from
-- 20260731000001_variant_option_types_and_values.sql (system option
-- types, then their Size values, then their Color values) — all three
-- already use `on conflict ... do nothing`, so this is safe to run
-- whether the target project is fully empty or already has some of these
-- rows.

-- ============================================================================
-- SEED — system option types
-- ============================================================================
insert into option_types (brand_id, name, key, is_system, sort_order)
values (null, 'Color', 'color', true, 1), (null, 'Size', 'size', true, 2)
on conflict (key) where brand_id is null do nothing;

-- ============================================================================
-- SEED — system Size values, grouped exactly as specified. `key`/`sku_token`
-- are derived from the label rather than hand-typed for ~100 rows: key is a
-- lowercase hyphenated slug (for duplicate detection), sku_token is an
-- uppercase alphanumeric-only code capped at 10 chars (for variant SKUs).
-- ============================================================================
with size_type as (
  select id from option_types where key = 'size' and brand_id is null
),
raw(label, sort_order) as (
  values
    -- STANDARD APPAREL
    ('XXXS', 1), ('XXS', 2), ('XS', 3), ('S', 4), ('M', 5), ('L', 6),
    ('XL', 7), ('XXL', 8), ('XXXL', 9), ('4XL', 10), ('5XL', 11),
    -- GENERAL
    ('One Size', 20),
    -- PANTS AND WAIST
    ('24', 30), ('25', 31), ('26', 32), ('27', 33), ('28', 34), ('29', 35),
    ('30', 36), ('31', 37), ('32', 38), ('33', 39), ('34', 40), ('35', 41),
    ('36', 42), ('38', 43), ('40', 44), ('42', 45), ('44', 46), ('46', 47),
    ('48', 48), ('50', 49), ('52', 50), ('54', 51),
    -- KIDS NUMERIC
    ('2', 60), ('3', 61), ('4', 62), ('5', 63), ('6', 64), ('7', 65),
    ('8', 66), ('9', 67), ('10', 68), ('11', 69), ('12', 70), ('13', 71),
    ('14', 72), ('15', 73), ('16', 74),
    -- BABY AND CHILD AGE
    ('Newborn', 80), ('0–3 Months', 81), ('3–6 Months', 82), ('6–9 Months', 83),
    ('9–12 Months', 84), ('12–18 Months', 85), ('18–24 Months', 86),
    ('2–3 Years', 87), ('3–4 Years', 88), ('4–5 Years', 89), ('5–6 Years', 90),
    ('6–7 Years', 91), ('7–8 Years', 92), ('8–9 Years', 93), ('9–10 Years', 94),
    ('10–11 Years', 95), ('11–12 Years', 96), ('12–13 Years', 97),
    ('13–14 Years', 98), ('14–15 Years', 99), ('15–16 Years', 100),
    -- SHOES — EU
    ('EU 16', 110), ('EU 17', 111), ('EU 18', 112), ('EU 19', 113), ('EU 20', 114),
    ('EU 21', 115), ('EU 22', 116), ('EU 23', 117), ('EU 24', 118), ('EU 25', 119),
    ('EU 26', 120), ('EU 27', 121), ('EU 28', 122), ('EU 29', 123), ('EU 30', 124),
    ('EU 31', 125), ('EU 32', 126), ('EU 33', 127), ('EU 34', 128), ('EU 35', 129),
    ('EU 36', 130), ('EU 37', 131), ('EU 38', 132), ('EU 39', 133), ('EU 40', 134),
    ('EU 41', 135), ('EU 42', 136), ('EU 43', 137), ('EU 44', 138), ('EU 45', 139),
    ('EU 46', 140), ('EU 47', 141), ('EU 48', 142), ('EU 49', 143), ('EU 50', 144)
)
insert into option_values (option_type_id, brand_id, label, key, sku_token, sort_order)
select
  size_type.id,
  null,
  raw.label,
  trim(both '-' from lower(regexp_replace(raw.label, '[^a-zA-Z0-9]+', '-', 'g'))),
  upper(left(regexp_replace(raw.label, '[^a-zA-Z0-9]', '', 'g'), 10)),
  raw.sort_order
from raw, size_type
on conflict (option_type_id, key) where brand_id is null do nothing;

-- ============================================================================
-- SEED — a starter set of system Color values (brands can still create
-- their own private colors on top of these; these are just the common
-- ones every brand would otherwise immediately recreate).
-- ============================================================================
with color_type as (
  select id from option_types where key = 'color' and brand_id is null
),
raw(label, swatch_type, primary_color, secondary_color, sort_order) as (
  values
    ('Black', 'single', '#000000', null, 1),
    ('White', 'single', '#FFFFFF', null, 2),
    ('Grey', 'single', '#808080', null, 3),
    ('Navy', 'single', '#1B2A4A', null, 4),
    ('Beige', 'single', '#E8DCC8', null, 5),
    ('Brown', 'single', '#5B3A29', null, 6),
    ('Red', 'single', '#C1272D', null, 7),
    ('Green', 'single', '#2E5339', null, 8),
    ('Blue', 'single', '#2C5AA0', null, 9),
    ('Yellow', 'single', '#F0C929', null, 10),
    ('Pink', 'single', '#E8A0BF', null, 11),
    ('Orange', 'single', '#E0742B', null, 12),
    ('Black & White', 'split', '#000000', '#FFFFFF', 13),
    ('Multicolor', 'multicolor', null, null, 14)
)
insert into option_values (option_type_id, brand_id, label, key, sku_token, swatch_type, primary_color, secondary_color, sort_order)
select
  color_type.id,
  null,
  raw.label,
  trim(both '-' from lower(regexp_replace(raw.label, '[^a-zA-Z0-9]+', '-', 'g'))),
  upper(left(regexp_replace(raw.label, '[^a-zA-Z0-9]', '', 'g'), 10)),
  raw.swatch_type,
  raw.primary_color,
  raw.secondary_color,
  raw.sort_order
from raw, color_type
on conflict (option_type_id, key) where brand_id is null do nothing;
