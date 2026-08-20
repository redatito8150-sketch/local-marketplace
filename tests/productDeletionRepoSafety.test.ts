import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

test("user-facing catalog routes use Archived, not Retired", () => {
  assert.equal(existsSync("app/brand-portal/products/archived/page.tsx"), true);
  assert.equal(existsSync("app/admin/products/archived/page.tsx"), true);
  assert.equal(existsSync("app/brand-portal/products/retired/page.tsx"), false);
  assert.equal(existsSync("app/admin/products/retired/page.tsx"), false);
  for (const file of ["app/brand-portal/products/archived/page.tsx", "app/admin/products/archived/page.tsx"]) {
    assert.doesNotMatch(read(file), /Retired|retired/);
  }
});

test("schedule APIs, pages, components, and cron are removed", () => {
  for (const path of [
    "app/api/cron/product-deletions/route.ts",
    "app/api/admin/products/deletion-schedules/route.ts",
    "app/api/admin/products/[id]/deletion-schedule/route.ts",
    "app/admin/products/deletion-schedules/page.tsx",
    "components/admin/DeletionScheduleRowActions.tsx",
  ]) assert.equal(existsSync(path), false, `${path} must be removed`);
  assert.doesNotMatch(read("vercel.json"), /product-deletions/);
});

test("brand assistants may Archive but only owners may hard-delete", () => {
  const route = read("app/api/brand-portal/products/[id]/deletion/route.ts");
  assert.match(route, /type Action = "archive" \| "delete_draft" \| "delete_live" \| "delete_archived"/);
  assert.match(route, /action !== "archive" && owner\.accessLevel !== "owner"/);
});

test("both permanent-delete confirmations require the exact product name", () => {
  const brand = read("components/brand-portal/ProductRowActions.tsx");
  const archived = read("components/admin/ArchivedProductRowActions.tsx");
  assert.match(brand, /confirmText !== name/);
  assert.match(archived, /confirmText !== productName/);
  assert.match(read("app/api/brand-portal/products/[id]/deletion/route.ts"), /confirmationName !== product\.name/);
  assert.match(read("app/api/admin/products/[id]/deletion/route.ts"), /confirmationName !== product\.name/);
});

// Delete-first spec (2026-08-19): Archived rows are still never directly
// editable, but Restore now exists as the dedicated Admin-only escape
// hatch — this test asserts the new shape (gated on audience === "admin",
// posting to the separate /restore endpoint) instead of the old "Restore
// doesn't exist at all" invariant.
test("Archived rows have no Edit action, gate Restore to admin only, and show every blocker with its resolution", () => {
  const actions = read("components/admin/ArchivedProductRowActions.tsx");
  assert.doesNotMatch(actions, /Edit product/);
  assert.match(actions, /audience === "admin" && allowRestore && !readOnly && eligibility\.canRestore/);
  assert.match(actions, /\/api\/admin\/products\/\$\{productId\}\/restore/);
  assert.match(actions, /eligibility\.immutableReasons/);
  assert.match(actions, /eligibility\.temporaryBlockers/);
  assert.match(actions, /blocker\.resolution/);
  assert.match(actions, /blockerHref/);
});

test("brand-portal Archived page tells the owner to contact an admin to restore a product", () => {
  const page = read("app/brand-portal/products/archived/page.tsx");
  assert.match(page, /contact an admin/i);
});

test("generic product edit routes cannot move Archived products back to another status — restoration only exists through the dedicated admin route", () => {
  for (const file of ["app/api/admin/products/[id]/route.ts", "app/api/brand-portal/products/[id]/route.ts"]) {
    const source = read(file);
    assert.match(source, /existing\.status === "archived"/);
    assert.doesNotMatch(source, /restoreProduct|restore_product|admin_restore_archived_product/);
  }
  // The one sanctioned path is a separate, admin-rank-gated route — not a
  // branch on the generic PATCH handler.
  assert.equal(existsSync("app/api/admin/products/[id]/restore/route.ts"), true);
  const restoreRoute = read("app/api/admin/products/[id]/restore/route.ts");
  assert.match(restoreRoute, /requireStaffRole\("admin"\)/);
  assert.match(restoreRoute, /adminRestoreArchivedProduct/);
});

test("upload route registers exact Storage paths and rolls back a file if registry insertion fails", () => {
  const route = read("app/api/admin/products/images/route.ts");
  assert.match(route, /from\("product_storage_assets"\)\.insert/);
  assert.match(route, /storage_path: path/);
  assert.match(route, /if \(registryError\)[\s\S]*?remove\(\[path\]\)/);
});

test("product create routes claim temporary uploads using the server-recorded references", () => {
  for (const file of ["app/api/admin/products/route.ts", "app/api/brand-portal/products/route.ts"]) {
    const source = read(file);
    assert.match(source, /x-upload-folder-id/);
    assert.match(source, /from\("product_media"\)\.select\("storage_reference"\)/);
    assert.match(source, /claimProductStorageAssets/);
  }
  assert.match(read("components/admin/ProductForm.tsx"), /"X-Upload-Folder-Id": uploadFolderId/);
});

test("storage cleanup queues abandoned product uploads before draining jobs", () => {
  const route = read("app/api/cron/storage-cleanup/route.ts");
  assert.match(route, /queue_abandoned_product_uploads/);
  assert.ok(route.indexOf('supabaseAdmin.rpc("queue_abandoned_product_uploads"') < route.indexOf("processStorageCleanupJobs({ limit: 100 })"));
});

test("admin bulk actions offer no lifecycle transition — they are reversible merchandising only", () => {
  const route = read("app/api/admin/products/bulk/route.ts");
  const component = read("components/admin/BulkProductActions.tsx");
  assert.match(route, /const BULK_ACTIONS = \["feature", "unfeature"\]/);
  assert.doesNotMatch(route, /BULK_ACTIONS[^\n]*publish/);
  assert.doesNotMatch(route, /BULK_ACTIONS[^\n]*archive/);
  assert.doesNotMatch(route, /BULK_ACTIONS[^\n]*delete_draft/);
  assert.doesNotMatch(route, /update\(\{ status/);
  assert.doesNotMatch(route, /\.from\("products"\)\.delete/);
  assert.doesNotMatch(route, /"retire"/);
  assert.doesNotMatch(component, />Publish<|>Archive<|runBulkAction\("archive"\)/);
});
