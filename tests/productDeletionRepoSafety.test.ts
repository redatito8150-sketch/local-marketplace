import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Repo-wide safety checks for the product deletion lifecycle redesign:
// no route anywhere still does a raw, unguarded `products`/`product_variants`
// hard delete, `deletion_requested_at` is never read as if it were the
// authoritative workflow state (it's a display-only mirror written by a
// trigger — see supabase/migrations/20260814020000_product_deletion_lifecycle.sql),
// and the old admin-approval deletion-request workflow (product_deletion_requests,
// archive_product, request_product_deletion, admin_approve_product_deletion,
// admin_update_deletion_request, the deletion-requests review-queue routes/
// page) has been fully removed, not just renamed — ordinary deletion is now
// automatic and database-authoritative, never gated on a human approval.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = path.join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const appApiFiles = walk(path.join(rootDir, "app", "api"));
const appLibComponentFiles = [
  ...walk(path.join(rootDir, "app")),
  ...walk(path.join(rootDir, "lib")),
  ...walk(path.join(rootDir, "components")),
];

test("no route directly hard-deletes a product via supabaseAdmin", () => {
  const offenders: string[] = [];
  for (const file of appApiFiles) {
    const relative = path.relative(rootDir, file).replace(/\\/g, "/");
    const content = readFileSync(file, "utf8");
    // Look for the specific unsafe pattern this migration replaced:
    // `.from("products").delete()` with no eligibility RPC involved.
    // lib/admin/productDeletion.ts's RPC wrappers and the migration's own
    // SQL are the only places a product row is actually removed now.
    if (/\.from\(\s*["']products["']\s*\)\s*\.delete\(\)/.test(content)) {
      offenders.push(relative);
    }
  }
  assert.deepEqual(offenders, [], `found raw products.delete() call(s) in: ${offenders.join(", ")}`);
});

test("the base product resources no longer expose an HTTP DELETE handler", () => {
  const brandPortalRoute = readFileSync(path.join(rootDir, "app/api/brand-portal/products/[id]/route.ts"), "utf8");
  const adminRoute = readFileSync(path.join(rootDir, "app/api/admin/products/[id]/route.ts"), "utf8");
  assert.doesNotMatch(brandPortalRoute, /export async function DELETE/);
  assert.doesNotMatch(adminRoute, /export async function DELETE/);
});

test("the admin bulk products route no longer offers a raw 'delete' action, and uses 'retire' (not 'archive') as its lifecycle action id", () => {
  const bulkRoute = readFileSync(path.join(rootDir, "app/api/admin/products/bulk/route.ts"), "utf8");
  assert.doesNotMatch(bulkRoute, /"publish",\s*"archive",\s*"delete"/);
  assert.match(bulkRoute, /delete_draft/);
  assert.match(bulkRoute, /BULK_ACTIONS = \[[^\]]*"retire"[^\]]*\]/);
  assert.doesNotMatch(bulkRoute, /BULK_ACTIONS = \[[^\]]*"archive"[^\]]*\]/);
});

// THIRD PASS: the guard below is unchanged from the second corrective pass
// — an archived (Retired) product still may only leave 'archived' through
// restore_product, regardless of which workflow (approval-queue or
// automatic-schedule) governs how it got there or what happens after.
test("admin and brand-portal product PATCH routes refuse leaving 'archived' via ANY status change, not just -> published", () => {
  const adminRoute = readFileSync(path.join(rootDir, "app/api/admin/products/[id]/route.ts"), "utf8");
  const brandPortalRoute = readFileSync(path.join(rootDir, "app/api/brand-portal/products/[id]/route.ts"), "utf8");
  for (const [name, content] of [["admin", adminRoute], ["brand-portal", brandPortalRoute]] as const) {
    assert.match(content, /existing\.status === "archived" && (body|productBody)\.status !== "archived"/, `${name} route missing the full archived-departure guard`);
    // The narrower, insufficient form must not be the one actually guarding.
    assert.doesNotMatch(content, /existing\.status === "archived" && (body|productBody)\.status === "published"/, `${name} route still has the incomplete published-only guard`);
  }
});

test("a database trigger blocks any archived -> non-archived UPDATE outside of restore_product", () => {
  const migration = readFileSync(path.join(rootDir, "supabase/migrations/20260814020000_product_deletion_lifecycle.sql"), "utf8");
  assert.match(migration, /create trigger products_enforce_archived_transition/);
  assert.match(migration, /before update of status on public\.products/);
  assert.match(migration, /app\.product_restore_in_progress/);
});

test("the admin bulk 'publish' action excludes currently-archived products instead of republishing them directly", () => {
  const bulkRoute = readFileSync(path.join(rootDir, "app/api/admin/products/bulk/route.ts"), "utf8");
  assert.match(bulkRoute, /RESTORE_REQUIRES_CANONICAL_RPC/);
  assert.match(bulkRoute, /existingById\.get\(id\)\?\.status === "archived"/);
});

test("deletion_requested_at is only ever read for display, never as a workflow gate, outside the migration/data-layer mapping", () => {
  const allowedFiles = new Set([
    "supabase/migrations/20260814020000_product_deletion_lifecycle.sql",
    "lib/data/brandPortal.ts",
    "lib/data/admin.ts",
    "components/admin/BulkProductActions.tsx",
    "app/brand-portal/products/page.tsx",
    "types/index.ts",
  ]);
  const offenders: string[] = [];
  const searchDirs = ["app", "lib", "components"].map((d) => path.join(rootDir, d));
  for (const dir of searchDirs) {
    for (const file of walk(dir)) {
      const relative = path.relative(rootDir, file).replace(/\\/g, "/");
      if (allowedFiles.has(relative)) continue;
      const content = readFileSync(file, "utf8");
      if (/deletion_requested_at|deletionRequestedAt/.test(content) && /\bif\s*\(/.test(content)) {
        // Only flag it if the file actually branches on the field (a
        // conditional near the match), not an unrelated `if` elsewhere in
        // an otherwise-uninvolved file.
        const nearMatch = new RegExp(`(deletion_requested_at|deletionRequestedAt)[^\\n]{0,80}`);
        const snippet = content.match(nearMatch)?.[0] ?? "";
        if (/\?|&&|status\s*===|status\s*==/.test(snippet)) offenders.push(relative);
      }
    }
  }
  assert.deepEqual(offenders, [], `deletion_requested_at used as a workflow gate in: ${offenders.join(", ")}`);
});

// THIRD PASS: the entire admin-approval deletion-request workflow (request
// -> under_review/blocked -> approved/rejected/cancelled -> completed, with
// a human clicking "Approve") was removed on purpose per the owner's
// explicit instruction that ordinary deletion eligibility is objective and
// database-authoritative — it must never wait on a human. These checks
// confirm the removal is real (no dangling references), not just that new
// code was added alongside the old.
test("the old admin-approval deletion-request workflow (routes, page, RPC names, table) has no remaining references anywhere in application code", () => {
  const staleIdentifiers = [
    /\bproduct_deletion_requests\b/,
    /\barchive_product\s*\(/,
    /\brequest_product_deletion\s*\(/,
    /\badmin_approve_product_deletion\s*\(/,
    /\badmin_update_deletion_request\s*\(/,
    /\badmin_search_deletion_requests\s*\(/,
    /app\/api\/admin\/products\/deletion-requests/,
    /app\/admin\/products\/deletion-requests/,
    /DeletionRequestRowActions/,
  ];
  const offenders: Array<{ file: string; pattern: string }> = [];
  for (const file of appLibComponentFiles) {
    const relative = path.relative(rootDir, file).replace(/\\/g, "/");
    const content = readFileSync(file, "utf8");
    for (const pattern of staleIdentifiers) {
      if (pattern.test(content)) offenders.push({ file: relative, pattern: pattern.source });
    }
  }
  assert.deepEqual(offenders, [], `stale old-model reference(s): ${offenders.map((o) => `${o.file} (${o.pattern})`).join(", ")}`);
});

test("the old admin-approval deletion-request review queue's routes and page no longer exist on disk", () => {
  const removedPaths = [
    "app/api/admin/products/deletion-requests/route.ts",
    "app/api/admin/products/deletion-requests/[id]/approve/route.ts",
    "app/api/admin/products/deletion-requests/[id]/route.ts",
    "app/admin/products/deletion-requests/page.tsx",
    "components/admin/DeletionRequestRowActions.tsx",
  ];
  for (const relative of removedPaths) {
    assert.equal(existsSync(path.join(rootDir, relative)), false, `${relative} should have been removed`);
  }
});

test("the new automatic schedule/hold routes and pages exist on disk, replacing the old approval-queue tree", () => {
  const requiredPaths = [
    "supabase/migrations/20260814020000_product_deletion_lifecycle.sql",
    "app/api/admin/products/deletion-schedules/route.ts",
    "app/admin/products/deletion-schedules/page.tsx",
    "app/api/admin/products/[id]/deletion-hold/route.ts",
    "app/api/admin/products/[id]/deletion-schedule/route.ts",
    "app/api/cron/product-deletions/route.ts",
    "app/admin/products/retired/page.tsx",
    "app/brand-portal/products/retired/page.tsx",
    "components/admin/RetiredProductRowActions.tsx",
    "components/admin/DeletionScheduleRowActions.tsx",
  ];
  for (const relative of requiredPaths) {
    assert.equal(existsSync(path.join(rootDir, relative)), true, `${relative} should exist`);
  }
});

test("the brand-portal deletion route gates schedule_delete/cancel_schedule/delete_draft to brand owners only, not assistants", () => {
  const content = readFileSync(path.join(rootDir, "app/api/brand-portal/products/[id]/deletion/route.ts"), "utf8");
  assert.match(content, /\["delete_draft",\s*"schedule_delete",\s*"cancel_schedule"\]\.includes\(action\)/);
  assert.match(content, /owner\.accessLevel !== "owner"/);
});

test("the cron executor route is authenticated via CRON_SECRET, matching the existing storage-cleanup cron's own pattern, and is never reachable by an ordinary user", () => {
  const content = readFileSync(path.join(rootDir, "app/api/cron/product-deletions/route.ts"), "utf8");
  assert.match(content, /process\.env\.CRON_SECRET/);
  assert.match(content, /request\.headers\.get\("authorization"\) !== `Bearer \$\{cronSecret\}`/);
  const vercelConfig = readFileSync(path.join(rootDir, "vercel.json"), "utf8");
  assert.match(vercelConfig, /"path":\s*"\/api\/cron\/product-deletions"/);
});
