-- Security hardening after the fulfillment/inventory release.
--
-- Trigger functions do not need to be callable through PostgREST. Their
-- triggers continue to run as normal after EXECUTE is revoked from API roles.
-- Pinning search_path also prevents a caller-controlled object from shadowing
-- a table or helper referenced by an unqualified name inside a function.

alter function public.brand_applications_set_updated_at() set search_path = public, pg_temp;
alter function public.enforce_taxonomy_node_level() set search_path = public, pg_temp;
alter function public.set_taxonomy_node_updated_at() set search_path = public, pg_temp;
alter function public.sync_product_brand_denormalized_fields() set search_path = public, pg_temp;
alter function public.enforce_sku_prefix_immutable_after_products() set search_path = public, pg_temp;
alter function public.set_collection_updated_at() set search_path = public, pg_temp;
alter function public.enforce_product_collection_brand_match() set search_path = public, pg_temp;
alter function public.enforce_product_type_id_is_level_3() set search_path = public, pg_temp;
alter function public.enforce_option_type_not_reserved() set search_path = public, pg_temp;
alter function public.enforce_option_value_matches_type_and_brand() set search_path = public, pg_temp;
alter function public.enforce_option_type_matches_brand() set search_path = public, pg_temp;
alter function public.set_product_color_images_updated_at() set search_path = public, pg_temp;

revoke all on function public.brand_applications_set_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_taxonomy_node_level() from public, anon, authenticated;
revoke all on function public.set_taxonomy_node_updated_at() from public, anon, authenticated;
revoke all on function public.sync_product_brand_denormalized_fields() from public, anon, authenticated;
revoke all on function public.enforce_sku_prefix_immutable_after_products() from public, anon, authenticated;
revoke all on function public.set_collection_updated_at() from public, anon, authenticated;
revoke all on function public.enforce_product_collection_brand_match() from public, anon, authenticated;
revoke all on function public.enforce_product_type_id_is_level_3() from public, anon, authenticated;
revoke all on function public.enforce_option_type_not_reserved() from public, anon, authenticated;
revoke all on function public.enforce_option_value_matches_type_and_brand() from public, anon, authenticated;
revoke all on function public.enforce_option_type_matches_brand() from public, anon, authenticated;
revoke all on function public.set_product_color_images_updated_at() from public, anon, authenticated;

-- This helper contains its own auth.uid() ownership predicate and remains
-- available to signed-in brand editors, but anonymous callers never need it.
revoke all on function public.get_my_brand_edit_metadata(text) from public, anon;
grant execute on function public.get_my_brand_edit_metadata(text) to authenticated, service_role;

-- These are invoked only by their database trigger/event-trigger definitions.
-- Keeping them off the Data API removes an unnecessary SECURITY DEFINER entry
-- point without affecting notification pruning or automatic RLS enablement.
revoke all on function public.prune_old_user_notifications() from public, anon, authenticated;
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- Retain only the constraint-backed unique indexes. The duplicate standalone
-- indexes enforce the exact same key and add write/storage overhead.
drop index if exists public.brand_follows_user_brand_key;
drop index if exists public.wishlists_user_product_key;
