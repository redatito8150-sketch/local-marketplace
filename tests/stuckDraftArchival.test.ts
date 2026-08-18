import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  "supabase/migrations/20260814201449_fix_stuck_draft_archival.sql",
  "utf8"
);
const actions = readFileSync("components/admin/AdminProductDeletionActions.tsx", "utf8");
const archivedActions = readFileSync("components/admin/ArchivedProductRowActions.tsx", "utf8");
const inventoryPage = readFileSync("app/admin/inventory/page.tsx", "utf8");
const linkResolver = readFileSync("lib/admin/productDeletionLinks.ts", "utf8");

test("non-pristine Draft repair is service-role-only and keeps Archived terminal", () => {
  assert.match(migration, /app\.admin_archive_non_pristine_draft/);
  assert.match(migration, /old\.status = 'draft' and v_admin_draft_repair/);
  assert.match(migration, /if old\.status = 'archived' and new\.status <> 'archived'/);
  assert.match(migration, /if coalesce\(\(v_eligibility->>'canDeleteDraft'\)::boolean, false\)/);
  assert.match(migration, /revoke all on function public\.admin_emergency_hide_product[\s\S]*?from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.admin_emergency_hide_product[\s\S]*?to service_role/);
});

test("the known migration smoke product is preserved as Archived, not deleted", () => {
  assert.match(migration, /migration-verify-product-e592656d/);
  assert.match(migration, /perform public\.admin_emergency_hide_product/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.products/i);
});

test("admin Draft deletion preflights eligibility and offers archival with real blockers", () => {
  assert.match(actions, /emergency-hide[\s\S]*?method: "POST"/);
  assert.match(actions, /eligibility\.canDeleteDraft/);
  assert.match(actions, /archive_dirty_draft/);
  assert.match(actions, /blockers\.map/);
  assert.match(actions, /Moving it to Archived removes it from the working catalog/);
});

test("inventory blocker links resolve to a real, product-filtered ledger", () => {
  assert.match(linkResolver, /PRODUCT_HAS_INVENTORY_HISTORY/);
  assert.match(linkResolver, /\/admin\/inventory\?productId=/);
  assert.match(archivedActions, /getAdminDeletionBlockerHref/);
  assert.match(inventoryPage, /getInventoryMovementsForAdmin/);
  assert.match(inventoryPage, /Immutable stock history · newest first/);
});
