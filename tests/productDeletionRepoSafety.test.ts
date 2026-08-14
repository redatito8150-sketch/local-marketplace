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
  assert.match(route, /type Action = "archive" \| "delete_draft" \| "delete_archived"/);
  assert.match(route, /action !== "archive" && owner\.accessLevel !== "owner"/);
});

test("both permanent-delete confirmations require the exact product name", () => {
  const brand = read("components/brand-portal/ProductRowActions.tsx");
  const archived = read("components/admin/ArchivedProductRowActions.tsx");
  assert.match(brand, /confirmText === name/);
  assert.match(archived, /confirmText !== productName/);
  assert.match(read("app/api/brand-portal/products/[id]/deletion/route.ts"), /confirmationName !== product\.name/);
  assert.match(read("app/api/admin/products/[id]/deletion/route.ts"), /confirmationName !== product\.name/);
});

test("Archived rows have no Edit or Restore action and show every blocker with its resolution", () => {
  const actions = read("components/admin/ArchivedProductRowActions.tsx");
  assert.doesNotMatch(actions, /Edit product|Restore/);
  assert.match(actions, /eligibility\.immutableReasons/);
  assert.match(actions, /eligibility\.temporaryBlockers/);
  assert.match(actions, /blocker\.resolution/);
  assert.match(actions, /blocker\.href/);
});

test("generic product edit routes cannot move Archived products back to another status", () => {
  for (const file of ["app/api/admin/products/[id]/route.ts", "app/api/brand-portal/products/[id]/route.ts"]) {
    const source = read(file);
    assert.match(source, /existing\.status === "archived"/);
    assert.doesNotMatch(source, /restoreProduct|restore_product/);
  }
  assert.equal(existsSync("app/api/admin/products/[id]/restore/route.ts"), false);
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

test("admin bulk actions use Archive and never offer bulk permanent deletion", () => {
  const route = read("app/api/admin/products/bulk/route.ts");
  assert.match(route, /"publish", "archive", "feature", "unfeature"/);
  assert.doesNotMatch(route, /BULK_ACTIONS[^\n]*delete_draft/);
  assert.doesNotMatch(route, /\.from\("products"\)\.delete/);
  assert.doesNotMatch(route, /"retire"/);
});
