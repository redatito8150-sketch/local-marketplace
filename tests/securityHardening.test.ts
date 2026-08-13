import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260814000008_security_hardening.sql", import.meta.url),
  "utf8"
);
const rlsPerformanceMigration = readFileSync(
  new URL("../supabase/migrations/20260814000009_rls_initplan_performance.sql", import.meta.url),
  "utf8"
);
const reorderRoute = readFileSync(
  new URL("../app/api/brands/[slug]/collections/reorder/route.ts", import.meta.url),
  "utf8"
);
const brandAboutPage = readFileSync(
  new URL("../app/brands/[slug]/about/page.tsx", import.meta.url),
  "utf8"
);
const fulfillmentIntegration = readFileSync(
  new URL("./fulfillmentIntegration.test.ts", import.meta.url),
  "utf8"
);

test("internal trigger functions have fixed search paths and are not exposed to API roles", () => {
  const triggerFunctions = [
    "brand_applications_set_updated_at",
    "enforce_taxonomy_node_level",
    "set_taxonomy_node_updated_at",
    "sync_product_brand_denormalized_fields",
    "enforce_sku_prefix_immutable_after_products",
    "set_collection_updated_at",
    "enforce_product_collection_brand_match",
    "enforce_product_type_id_is_level_3",
    "enforce_option_type_not_reserved",
    "enforce_option_value_matches_type_and_brand",
    "enforce_option_type_matches_brand",
    "set_product_color_images_updated_at",
  ];

  for (const functionName of triggerFunctions) {
    assert.match(
      migration,
      new RegExp(`alter function public\\.${functionName}\\(\\) set search_path = public, pg_temp`, "i")
    );
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${functionName}\\(\\) from public, anon, authenticated`, "i")
    );
  }
});

test("SECURITY DEFINER trigger entry points and anonymous brand metadata access are revoked", () => {
  assert.match(
    migration,
    /revoke all on function public\.get_my_brand_edit_metadata\(text\) from public, anon/i
  );
  assert.match(
    migration,
    /grant execute on function public\.get_my_brand_edit_metadata\(text\) to authenticated, service_role/i
  );
  assert.match(
    migration,
    /revoke all on function public\.prune_old_user_notifications\(\) from public, anon, authenticated/i
  );
  assert.match(
    migration,
    /revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated/i
  );
});

test("only redundant non-constraint indexes are removed", () => {
  assert.match(migration, /drop index if exists public\.brand_follows_user_brand_key/i);
  assert.match(migration, /drop index if exists public\.wishlists_user_product_key/i);
  assert.doesNotMatch(migration, /drop index if exists public\.brand_follows_user_id_brand_slug_key/i);
  assert.doesNotMatch(migration, /drop index if exists public\.wishlists_user_id_product_id_key/i);
});

test("collection reordering rejects duplicate collection ids", () => {
  assert.match(reorderRoute, /new Set\(orderedIds\)\.size !== orderedIds\.length/);
  assert.match(reorderRoute, /Each collection must appear exactly once/);
});

test("historical brand rich text is sanitized again before public rendering", () => {
  assert.match(brandAboutPage, /import \{ sanitizeRichText, stripRichText \}/);
  assert.match(brandAboutPage, /const introduction = sanitizeRichText\(introductionSource\)/);
  assert.match(brandAboutPage, /value=\{introduction\}/);
});

test("RLS policies cache auth.uid once per statement without changing their predicates", () => {
  assert.match(rlsPerformanceMigration, /replace\(policy_row\.qual, 'auth\.uid\(\)', '\(select auth\.uid\(\)\)'\)/);
  assert.match(rlsPerformanceMigration, /replace\(policy_row\.with_check, 'auth\.uid\(\)', '\(select auth\.uid\(\)\)'\)/);
  assert.match(rlsPerformanceMigration, /'Users can update their own cart'/);
  assert.match(rlsPerformanceMigration, /'Brand members can read their products'/);
});

test("write-heavy fulfillment integration tests require an explicit isolated-database opt-in", () => {
  assert.match(fulfillmentIntegration, /RUN_FULFILLMENT_INTEGRATION === "1"/);
  assert.match(fulfillmentIntegration, /integrationTestsEnabled && hasCredentials && schemaReady/);
});
