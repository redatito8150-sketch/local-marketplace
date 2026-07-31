-- ============================================================================
-- FULL RESET to a clean testing state (dev/staging only)
--
-- Explicitly authorized, one-time destructive wipe: the site is still in
-- development (no payment gateway wired in yet, per CLAUDE.md), so this
-- clears every product/order/review/brand-application/brand row and
-- returns every account to a plain customer, so testing can restart from
-- brand application submission onward with a clean slate.
--
-- PRESERVED — the only exception, anywhere:
--   - The single primary account (redatito8150@gmail.com) keeps
--     profiles.role='admin'/is_admin=true and its Admin role assignment.
--     Every other account, with no exception (including any existing
--     brand-owner/brand-assistant link), becomes a plain customer with
--     zero access.
--
-- NOT touched (not part of what was asked, and not "test data" in the
-- same sense — clearing these is a separate decision if ever wanted):
--   - The roles/permissions/role_permissions catalog itself (Admin/
--     Manager/Staff/any custom role definitions) — only *membership*
--     (user_roles) is cleared, not the role definitions.
--   - coupons, site_content, page_studio sections/versions, taxonomy
--     nodes, size profiles, addresses, notifications, audit_logs — none
--     of these are catalog/transactional test data, and audit_logs in
--     particular is documented as an intentionally permanent record.
--     Note: notifications/audit_logs may still show entries referencing
--     now-deleted products/orders/brands (they store free-text type/
--     entity_id, not real foreign keys, so nothing breaks — just
--     historical clutter if it bothers you later).
--
-- Dependency order below follows the same reasoning already used and
-- verified in this repo's own 20260730000001_reset_test_catalog_data.sql
-- precedent, extended to cover orders/applications/brands/accounts too.
-- brands <-> brand_applications is a circular RESTRICT relationship
-- (brands.source_application_id -> brand_applications, and
-- brand_applications.converted_brand_id -> brands), broken by nulling
-- both FK columns before either table is touched.
--
-- Wrapped in a single transaction: any failure rolls back the entire
-- reset, never a partial one.
-- ============================================================================

begin;

-- 0. Break the circular brands <-> brand_applications FK (both RESTRICT).
update brands set source_application_id = null where source_application_id is not null;
update brand_applications set converted_brand_id = null where converted_brand_id is not null;

-- 1. Reviews — restrict against both products and order_items, so these
--    must go before either. Cascades review_images/review_replies/
--    review_helpful_votes/review_reports automatically.
delete from reviews;

-- 2. Live-only per-user product/brand references (untracked in any
--    migration file — confirmed via the precedent reset migration's own
--    live introspection).
delete from wishlists;
delete from cart_items;
delete from recently_viewed;
delete from brand_follows;

-- 3. Inventory ledger — restrict against variants/products/brands.
delete from inventory_movements;

-- 4. Orders (cascades order_items automatically; deleted explicitly too
--    so the reset doesn't rely on cascade behavior to reach a
--    verifiable zero).
delete from order_items;
delete from orders;

-- 5. Product variants (cascade from products; explicit for certainty).
delete from product_variants;

-- 6. Products themselves — cascades product_options/
--    product_option_values/product_variant_values/product_color_images/
--    product_media; restrict against brands, so must precede brands.
delete from products;

-- 7. Brand application child tables that are RESTRICT, not cascade —
--    must precede brand_applications.
delete from brand_application_revisions;
delete from brand_application_information_requests;

-- 8. Brand applications (cascades brand_application_documents/
--    brand_application_status_history automatically).
delete from brand_applications;

-- 9. Brand-scoped tables (cascade from brands; explicit for certainty).
delete from brand_sku_counters;
delete from brand_staff;
delete from collections;
delete from option_types;
delete from option_values;

-- 10. Brands themselves — every one, no exception this time.
delete from brands;

-- 11. Every account becomes a plain customer with zero access, except
--     the one primary account.
update profiles
set is_admin = false, role = 'customer'
where email is distinct from 'redatito8150@gmail.com';

-- 12. Clear every custom-role membership except the primary account's.
delete from user_roles
where user_id not in (select id from profiles where email = 'redatito8150@gmail.com');

commit;

-- ============================================================================
-- Verification queries (run manually after applying this migration):
--
--   select count(*) from products;             -- expect 0
--   select count(*) from product_variants;      -- expect 0
--   select count(*) from reviews;                -- expect 0
--   select count(*) from wishlists;               -- expect 0
--   select count(*) from cart_items;               -- expect 0
--   select count(*) from recently_viewed;           -- expect 0
--   select count(*) from brand_follows;              -- expect 0
--   select count(*) from orders;                      -- expect 0
--   select count(*) from order_items;                  -- expect 0
--   select count(*) from inventory_movements;           -- expect 0
--   select count(*) from brand_applications;             -- expect 0
--   select count(*) from brands;                          -- expect 0
--   select email, role, is_admin from profiles
--     where role <> 'customer' or is_admin = true;         -- expect only redatito8150@gmail.com
--   select count(*) from user_roles;                        -- expect 1 (the primary account's Admin row)
-- ============================================================================
