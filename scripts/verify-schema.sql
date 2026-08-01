-- ============================================================================
-- Schema drift audit — run this once against the live/production database to
-- find any migration that was silently skipped (same class of bug as the
-- missing brands.return_policy column found on 2026-08-01).
--
-- This is a read-only report. It does NOT fix anything by itself — for each
-- row it finds, go back to the migration file named in the last column and
-- run it (every migration in this repo is additive/idempotent, safe to
-- re-run). Extracted mechanically from every `create table if not exists`,
-- `alter table ... add column if not exists`, and `create function`
-- statement across supabase/migrations/*.sql as of 2026-08-01.
-- ============================================================================

-- 1) Missing tables
with expected_tables(table_name) as (
  values
    ('addresses'), ('brand_application_documents'), ('brand_application_information_requests'),
    ('brand_application_revisions'), ('brand_application_status_history'), ('brand_sku_counters'),
    ('collections'), ('inventory_movements'), ('option_types'), ('option_values'),
    ('order_status_history'), ('page_sections'), ('page_versions'), ('permissions'),
    ('phone_verifications'), ('product_color_images'), ('product_media'),
    ('product_option_values'), ('product_options'), ('product_variant_values'),
    ('review_helpful_votes'), ('review_images'), ('review_replies'), ('review_reports'),
    ('reviews'), ('role_permissions'), ('roles'), ('size_profile_values'), ('size_profiles'),
    ('taxonomy_nodes'), ('taxonomy_size_profiles'), ('user_notifications'), ('user_roles'),
    ('user_sessions')
)
select 'MISSING TABLE' as issue, e.table_name, null as column_name
from expected_tables e
where not exists (
  select 1 from information_schema.tables t
  where t.table_schema = 'public' and t.table_name = e.table_name
)

union all

-- 2) Missing columns
select 'MISSING COLUMN', e.table_name, e.column_name
from (
  values
    ('addresses','apartment'), ('addresses','building_number'), ('addresses','delivery_instructions'),
    ('addresses','floor'), ('addresses','landmark'), ('addresses','postal_code'),
    ('brand_application_documents','document_type'), ('brand_application_documents','removed_at'),
    ('brand_application_documents','replaced_by'), ('brand_application_documents','upload_status'),
    ('brand_applications','additional_categories'), ('brand_applications','admin_notes'),
    ('brand_applications','applicant_account_snapshot'), ('brand_applications','applicant_role'),
    ('brand_applications','applicant_role_other'), ('brand_applications','applicant_user_id'),
    ('brand_applications','applicant_visible_message'), ('brand_applications','application_data'),
    ('brand_applications','approved_brand_id'), ('brand_applications','approx_monthly_orders'),
    ('brand_applications','approx_monthly_orders_range'), ('brand_applications','approx_product_count'),
    ('brand_applications','approx_product_count_range'), ('brand_applications','avg_preparation_time'),
    ('brand_applications','avg_preparation_time_range'), ('brand_applications','brand_name_ar'),
    ('brand_applications','brand_name_en'), ('brand_applications','changes_requested_message'),
    ('brand_applications','city'), ('brand_applications','commercial_registration_number'),
    ('brand_applications','consent_accurate'), ('brand_applications','consent_terms'),
    ('brand_applications','converted_at'), ('brand_applications','converted_brand_id'),
    ('brand_applications','converted_by'), ('brand_applications','country'),
    ('brand_applications','current_step'), ('brand_applications','founding_year'),
    ('brand_applications','fulfillment_model'), ('brand_applications','fulfillment_responsibility'),
    ('brand_applications','information_response_deadline'), ('brand_applications','inventory_model'),
    ('brand_applications','inventory_status'), ('brand_applications','last_resubmitted_at'),
    ('brand_applications','last_saved_at'), ('brand_applications','legal_business_name'),
    ('brand_applications','legal_status'), ('brand_applications','lock_version'),
    ('brand_applications','made_to_order'), ('brand_applications','manufacturing_model'),
    ('brand_applications','other_social_urls'), ('brand_applications','preferred_contact_method'),
    ('brand_applications','price_max'), ('brand_applications','price_min'),
    ('brand_applications','product_price_range'), ('brand_applications','products_manufactured_by_brand'),
    ('brand_applications','reapplication_allowed_at'), ('brand_applications','reapplication_override'),
    ('brand_applications','reference_number'), ('brand_applications','rejection_reason'),
    ('brand_applications','requested_fields'), ('brand_applications','requested_sections'),
    ('brand_applications','return_exchange_available'), ('brand_applications','returns_policy'),
    ('brand_applications','returns_policy_details'), ('brand_applications','reviewed_at'),
    ('brand_applications','reviewed_by'), ('brand_applications','sales_channel_links'),
    ('brand_applications','sales_channels_list'), ('brand_applications','schema_version'),
    ('brand_applications','shipping_coverage'), ('brand_applications','shipping_coverage_option'),
    ('brand_applications','shipping_governorates'), ('brand_applications','submitted_at'),
    ('brand_applications','tax_registration_number'), ('brand_applications','updated_at'),
    ('brand_applications','website_url'),
    ('brand_staff','brand_id'),
    ('brands','additional_categories'), ('brands','id'), ('brands','is_active'), ('brands','is_mahaly_partner'), ('brands','logo_image'),
    ('brands','onboarding_defaults'), ('brands','return_policy'), ('brands','return_window_days'),
    ('brands','setup_status'), ('brands','shipping_policy'), ('brands','shop_the_look'),
    ('brands','sku_prefix'), ('brands','source_application_id'), ('brands','story_image_2'),
    ('brands','website_url'), ('brands','is_sponsored'), ('brands','sponsored_placements'),
    ('brands','sponsored_order'),
    ('collections','archived_at'),
    ('option_types','archived_at'), ('option_types','is_archived'), ('option_types','updated_at'),
    ('option_values','archived_at'), ('option_values','is_archived'), ('option_values','updated_at'),
    ('orders','address_id'), ('orders','brand_slug'), ('orders','fulfillment_type'),
    ('orders','order_group_id'), ('orders','payment_method'), ('orders','payment_status'),
    ('orders','shipping_fee_egp'),
    ('page_sections','draft_deleted'), ('page_sections','published_deleted'),
    ('product_variants','combo_key'), ('product_variants','is_archived'),
    ('product_variants','low_stock_threshold_override'),
    ('products','audience'), ('products','brand_id'), ('products','collection_id'),
    ('products','default_low_stock_threshold'), ('products','discount_ends_at'),
    ('products','discount_percent'), ('products','materials'), ('products','product_type_id'),
    ('profiles','avatar_url'), ('profiles','onboarding_completed_at'), ('profiles','phone'),
    ('profiles','phone_verified_at'), ('profiles','provider_avatar_url'),
    ('roles','rank')
) as e(table_name, column_name)
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = e.table_name and c.column_name = e.column_name
)

union all

-- 3) Missing functions/RPCs
select 'MISSING FUNCTION', e.fn, null
from (
  values
    ('apply_inventory_adjustments'), ('assign_user_role'), ('brand_applications_set_updated_at'),
    ('cancel_order'), ('cancel_order_group'), ('convert_application_to_brand'),
    ('create_page_section_draft'), ('create_variant_with_opening_stock'), ('delete_page_section_draft'),
    ('discard_page_draft'), ('duplicate_page_section_draft'), ('enforce_color_image_is_color_option'),
    ('enforce_max_3_product_options'), ('enforce_option_type_matches_brand'),
    ('enforce_option_type_not_reserved'), ('enforce_option_value_matches_type_and_brand'),
    ('enforce_product_collection_brand_match'), ('enforce_product_type_id_is_level_3'),
    ('enforce_sku_prefix_immutable_after_products'), ('enforce_taxonomy_node_level'),
    ('handle_new_user'), ('next_brand_application_reference'), ('next_product_sku'), ('place_order'),
    ('prevent_inventory_movement_mutation'), ('protect_review_purchase_identity'),
    ('prune_old_user_notifications'), ('publish_page_draft'), ('recompute_profile_tier'),
    ('record_order_cancelled_inventory_movements'), ('record_order_placed_inventory_movement'),
    ('reorder_page_draft'), ('replace_product_with_variants'), ('restore_page_version_to_draft'),
    ('review_purchase_is_eligible'), ('save_page_section_draft'), ('set_collection_updated_at'),
    ('set_default_address'), ('set_product_color_images_updated_at'), ('set_review_reply_timestamp'),
    ('set_review_timestamps'), ('set_taxonomy_node_updated_at'), ('set_user_access'),
    ('sync_product_brand_denormalized_fields'), ('sync_provider_avatar'), ('unassign_user_role')
) as e(fn)
where not exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = e.fn
)

order by 1, 2, 3;

-- An empty result set (0 rows) means every migration in this repo has been
-- fully applied. Any row returned names exactly what's missing — go re-run
-- the migration file that introduces it (grep the column/function/table
-- name across supabase/migrations/*.sql to find which file).
