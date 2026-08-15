-- Production hotfix, follow-up to 20260816014537_grant_private_schema_
-- usage_to_service_role.sql. That migration fixed "permission denied for
-- schema private" but exposed the next layer of the same issue:
-- "permission denied for function stamp_product_first_visible_if_eligible".
--
-- private.stamp_product_first_visible_if_eligible(text) has EXECUTE
-- explicitly revoked from service_role (20260815000000_product_launch_
-- policy_and_opening_stock.sql, by design — it's meant to be reached only
-- via its public.* SECURITY DEFINER wrapper, or directly from other
-- SECURITY DEFINER plpgsql in the same migration such as
-- apply_inventory_adjustments). The new AFTER trigger function
-- private.products_after_write_stamp_visibility() calls it directly but
-- was declared without SECURITY DEFINER, so it runs with the FIRING role's
-- privileges (service_role, for every write in this app) instead of its
-- own owner's — and service_role has no EXECUTE on the private function.
--
-- Fix: make the trigger function SECURITY DEFINER, matching the same
-- pattern used by every other private.* function in this codebase that
-- needs to be reachable across a privilege boundary (e.g.
-- private.is_product_customer_visible). This does not widen what the
-- trigger can do — it already only ever calls one specific, already-
-- reviewed private function with a fixed, non-caller-controlled argument
-- (new.id) — it just lets that call actually resolve.
create or replace function private.products_after_write_stamp_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.stamp_product_first_visible_if_eligible(new.id);
  return null;
end;
$$;

revoke all on function private.products_after_write_stamp_visibility() from public, anon, authenticated, service_role;
