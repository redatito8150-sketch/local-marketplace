import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Repo-wide safety checks for the product deletion lifecycle redesign:
// no route anywhere still does a raw, unguarded `products`/`product_variants`
// hard delete, and `deletion_requested_at` is never read as if it were the
// authoritative workflow state (it's a display-only mirror written by a
// trigger — see supabase/migrations/20260814020000_product_deletion_lifecycle.sql).

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

test("the admin bulk products route no longer offers a 'delete' action", () => {
  const bulkRoute = readFileSync(path.join(rootDir, "app/api/admin/products/bulk/route.ts"), "utf8");
  assert.doesNotMatch(bulkRoute, /"publish",\s*"archive",\s*"delete"/);
  assert.match(bulkRoute, /delete_draft/);
});

// SECOND CORRECTIVE PASS: the original guard here only blocked
// archived -> published directly, which still allowed a two-step bypass
// (archived -> draft through this same route, then the ordinary publish
// flow — no longer seeing "archived" — republished it, all without ever
// calling restore_product). The guard must now reject ANY status change
// away from "archived", not just to "published" — this is deliberately a
// stronger regex than "status === published" alone, since that specific
// weaker check is exactly what let the two-step bypass through.
test("admin and brand-portal product PATCH routes refuse leaving 'archived' via ANY status change, not just -> published", () => {
  const adminRoute = readFileSync(path.join(rootDir, "app/api/admin/products/[id]/route.ts"), "utf8");
  const brandPortalRoute = readFileSync(path.join(rootDir, "app/api/brand-portal/products/[id]/route.ts"), "utf8");
  for (const [name, content] of [["admin", adminRoute], ["brand-portal", brandPortalRoute]] as const) {
    assert.match(content, /existing\.status === "archived" && (body|productBody)\.status !== "archived"/, `${name} route missing the full archived-departure guard`);
    // The narrower, insufficient form must not be the one actually guarding.
    assert.doesNotMatch(content, /existing\.status === "archived" && (body|productBody)\.status === "published"/, `${name} route still has the incomplete published-only guard`);
  }
});

// SECOND CORRECTIVE PASS (item 1): the database-level backstop for the
// same bypass — required precisely because "future service-role code" is
// explicitly called out as a risk the API-layer guards above can't cover
// on their own.
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
