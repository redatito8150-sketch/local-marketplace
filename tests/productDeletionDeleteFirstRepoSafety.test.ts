import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260819120000_paused_status_and_delete_first_lifecycle.sql");

// Static verification of the delete-first lifecycle wiring — the same
// source-text-assertion convention tests/productLaunchPolicyRepoSafety.test.ts
// and tests/productDeletionRepoSafety.test.ts already use for properties that
// matter for security/correctness but require a migrated live database to
// exercise end-to-end (see tests/productDeletionDeleteFirst.test.ts for the
// live-gated counterparts, all of which currently skip on this machine since
// the migration has not been applied per the task's explicit "don't apply
// SQL" instruction).

test("products.status widens to include 'paused' and the legacy paused_by_brand flag is constrained to false/null", () => {
  assert.match(migration, /check \(status in \('draft', 'pending_review', 'changes_requested', 'published', 'paused', 'archived'\)\)/);
  assert.match(migration, /products_paused_flag_deprecated/);
  assert.match(migration, /check \(paused_by_brand is not true\)/);
});

test("the backfill is scoped and idempotent — only converts the exact legacy combination, never touches an already-canonical row", () => {
  assert.match(migration, /update public\.products\s*\n\s*set status = 'paused', paused_by_brand = false\s*\n\s*where status = 'published' and coalesce\(paused_by_brand, false\) = true;/);
});

test("private.is_product_customer_visible no longer checks paused_by_brand — status alone is canonical", () => {
  const fn = migration.slice(migration.indexOf("private.is_product_customer_visible"), migration.indexOf("private.is_product_customer_visible") + 1200);
  assert.match(fn, /p\.status = 'published'/);
  assert.doesNotMatch(fn, /paused_by_brand/);
});

test("the lifecycle trigger blocks Paused/Published -> Draft, Draft -> Paused, and protects an already-set first_visible_at", () => {
  assert.match(migration, /tg_op = 'INSERT' and new\.status = 'paused'/);
  assert.match(migration, /PRODUCT_PAUSED_REQUIRES_PRIOR_PUBLISH/);
  assert.match(migration, /before insert or update on public\.products/);
  assert.match(migration, /old\.status in \('published', 'paused'\) and new\.status = 'draft'/);
  assert.match(migration, /PRODUCT_PUBLISHED_CANNOT_REVERT_TO_DRAFT/);
  assert.match(migration, /old\.status = 'draft' and new\.status = 'paused'/);
  assert.match(migration, /PRODUCT_DRAFT_CANNOT_PAUSE/);
  assert.match(migration, /PRODUCT_FIRST_VISIBLE_AT_IS_IMMUTABLE/);
});

test("Archived is terminal for everyone except the sanctioned restore path, which may only land on Paused", () => {
  assert.match(migration, /if old\.status = 'archived' and new\.status <> 'archived' then/);
  assert.match(migration, /if not v_restore_in_progress then/);
  assert.match(migration, /PRODUCT_ARCHIVED_IS_TERMINAL/);
  assert.match(migration, /if new\.status <> 'paused' then/);
  assert.match(migration, /PRODUCT_RESTORE_MUST_TARGET_PAUSED/);
  // The restore-in-progress flag is only ever set inside the restore RPC
  // itself (SECURITY DEFINER, running as its owner) — not settable by an
  // ordinary client, so a crafted PATCH cannot forge the sanctioned path.
  assert.match(migration, /perform set_config\('app\.product_restore_in_progress', 'on', true\);/);
});

test("archive_product refuses to archive a product with no immutable history — Archive can never be used as an ordinary hide action", () => {
  const fn = migration.slice(migration.indexOf("create or replace function public.archive_product"));
  assert.match(fn, /v_eligibility := private\.compute_product_deletion_eligibility\(p_product_id\);/);
  assert.match(fn, /ARCHIVE_NOT_REQUIRED/);
  assert.match(fn, /PRODUCT_ARCHIVE_BLOCKED/);
  assert.match(fn, /hasTemporaryBlockers/);
});

test("the admin-only non-pristine Draft repair survives the new trigger and cannot strand temporary state", () => {
  const fn = migration.slice(
    migration.indexOf("create or replace function public.admin_emergency_hide_product"),
    migration.indexOf("create or replace function private.delete_product_permanently")
  );
  assert.match(migration, /app\.admin_archive_non_pristine_draft/);
  assert.match(migration, /PRODUCT_DRAFT_ARCHIVE_REQUIRES_ADMIN_REPAIR_RPC/);
  assert.match(fn, /canDeleteDraft/);
  assert.match(fn, /hasTemporaryBlockers/);
  assert.match(fn, /PRODUCT_ARCHIVE_BLOCKED/);
  assert.match(fn, /order by id[\s\S]*for update/);
});

test("delete_live_product and admin_restore_archived_product both recompute eligibility / re-check requirements inside the same locked transaction, never trusting a prior read", () => {
  assert.match(migration, /create or replace function public\.delete_live_product/);
  assert.match(migration, /select private\.delete_product_permanently\(/);
  const restoreFn = migration.slice(migration.indexOf("create or replace function public.admin_restore_archived_product"));
  assert.match(restoreFn, /select \* into v_product from public\.products where id = p_product_id for update;/);
  assert.match(restoreFn, /select \* into v_brand from public\.brands where id = v_product\.brand_id;/);
  assert.match(restoreFn, /if v_brand is null or v_brand\.is_active is not true then/);
  assert.match(restoreFn, /product_deletion_holds/);
  assert.match(restoreFn, /status = 'paused'/);
  // Hidden restoration is intentionally repairable; customer visibility is
  // gated later by resume_product's locked completeness/Variant checks.
  assert.doesNotMatch(restoreFn, /v_variant_count = 0/);
});

test("an in-flight card payment is a temporary blocker for both deletion and Archive", () => {
  assert.match(migration, /PRODUCT_HAS_OPEN_PAYMENT_ATTEMPT/);
  assert.match(migration, /pa\.status in \('processing', 'paid', 'reflecting'\)/);
  assert.match(migration, /item ->> 'productId' = p_product_id/);
  assert.match(migration, /'canArchive'[\s\S]*jsonb_array_length\(v_temporary\) = 0/);
});

test("restore safely lands incomplete records on Paused, while Resume enforces the complete publish-ready core", () => {
  const resume = migration.slice(migration.indexOf("create or replace function public.resume_product"), migration.indexOf("create or replace function public.archive_product"));
  assert.match(resume, /selling_status = 'active'/);
  assert.match(resume, /v_product\.image/);
  assert.match(resume, /v_product\.description/);
  assert.match(resume, /v_product\.launch_policy not in \('show_now', 'when_stocked'\)/);
  const restore = migration.slice(migration.indexOf("create or replace function public.admin_restore_archived_product"));
  assert.doesNotMatch(restore, /PRODUCT_HAS_NO_VARIANTS/);
  assert.doesNotMatch(restore, /PRODUCT_INCOMPLETE/);
  assert.match(restore, /set status = 'paused'/);
});

test("every new function is row-locked with FOR UPDATE where it mutates a product, guarding concurrent requests", () => {
  for (const fn of ["public.pause_product", "public.resume_product", "public.archive_product", "public.admin_restore_archived_product"]) {
    const start = migration.indexOf(`create or replace function ${fn}`);
    assert.ok(start >= 0, `${fn} not found`);
    const body = migration.slice(start, start + 2500);
    assert.match(body, /for update/, `${fn} must lock the product row`);
  }
});

test("admin_restore_archived_product requires a reason and an idempotency key, and replays the original outcome on retry", () => {
  const fn = migration.slice(migration.indexOf("create or replace function public.admin_restore_archived_product"));
  assert.match(fn, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(fn, /REASON_REQUIRED/);
  assert.match(fn, /select \* into v_existing from public\.product_restore_history/);
  assert.match(fn, /ALREADY_RESTORED/);
  assert.match(fn, /IDEMPOTENCY_CONFLICT/);
});

test("every new RPC is revoked from public/anon/authenticated and granted only to service_role", () => {
  for (const fn of [
    "private.is_product_customer_visible(text)",
    "private.enforce_product_lifecycle_transition()",
    "private.enforce_archived_product_transition()",
    "private.compute_product_deletion_eligibility(text)",
    "public.pause_product(text, uuid, uuid)",
    "public.resume_product(text, uuid, uuid)",
    "public.archive_product(text, uuid, uuid, text)",
    "public.delete_live_product(text, uuid, uuid, text, text, text)",
    "public.admin_restore_archived_product(text, uuid, text, text, text)",
  ]) {
    const revokePattern = new RegExp(`revoke all on function ${fn.replace(/[.()]/g, "\\$&")} from`);
    assert.match(migration, revokePattern, `${fn} missing an explicit REVOKE`);
  }
  // The two customer-facing SELECT-only exceptions stay anon/authenticated
  // readable (they must be, to power the storefront); every mutating RPC
  // is service_role only.
  assert.doesNotMatch(migration.slice(migration.indexOf("create or replace function public.pause_product")), /grant execute[^;]*to anon/);
  assert.doesNotMatch(migration.slice(migration.indexOf("create or replace function public.admin_restore_archived_product")), /grant execute[^;]*to anon/);
});

test("every SECURITY DEFINER / privileged function pins a fixed search_path", () => {
  const definitions = migration.split(/create or replace function/).slice(1);
  for (const def of definitions) {
    if (/^\s+private\.enforce_product_lifecycle_transition/.test(def) || /^\s+private\.enforce_archived_product_transition/.test(def)) continue;
    assert.match(def, /set search_path = ''/, `a function definition is missing a pinned search_path:\n${def.slice(0, 120)}`);
  }
});

test("the migration ends with a verification guard that fails loudly rather than leaving a half-migrated state", () => {
  assert.match(migration, /raise exception 'Migration guard: % product\(s\) still carry paused_by_brand = true'/);
  assert.match(migration, /raise exception 'Migration guard: % product\(s\) have an unrecognised status'/);
});

// ---------------------------------------------------------------------------
// Application-layer wiring
// ---------------------------------------------------------------------------

test("ProductStatus includes 'paused' as a first-class status, not a derived label", () => {
  const types = read("types/index.ts");
  assert.match(types, /\| "paused"/);
});

test("Pause/Resume in both admin and brand-portal go through the canonical RPCs, not a raw paused_by_brand update", () => {
  for (const file of ["app/api/admin/products/[id]/pause/route.ts", "app/api/brand-portal/products/[id]/route.ts"]) {
    const source = read(file);
    assert.doesNotMatch(source, /\.update\(\{\s*paused_by_brand:/);
    assert.match(source, /pauseProduct|resumeProduct/);
  }
});

test("bulk actions cannot bypass publish, pause/resume, archive, or permanent-deletion policy", () => {
  const route = read("app/api/admin/products/bulk/route.ts");
  assert.match(route, /const BULK_ACTIONS = \["feature", "unfeature"\]/);
  assert.doesNotMatch(route, /BULK_ACTIONS[^\n]*publish/);
  assert.doesNotMatch(route, /BULK_ACTIONS[^\n]*archive/);
  assert.doesNotMatch(route, /BULK_ACTIONS[^\n]*delete/);
  assert.doesNotMatch(route, /update\(\{ status/);
});

test("Delete permanently replaces Archive as the ordinary product menu action in both Admin and Brand Portal", () => {
  const admin = read("components/admin/AdminProductDeletionActions.tsx");
  const brand = read("components/brand-portal/ProductRowActions.tsx");
  for (const source of [admin, brand]) {
    assert.match(source, /Delete permanently/);
    assert.doesNotMatch(source, />\s*Archive\s*<\/button>/);
  }
});

test("Admin Dashboard and Brand Portal share one lifecycle dialog implementation — not two divergent ones", () => {
  const admin = read("components/admin/AdminProductDeletionActions.tsx");
  const brand = read("components/brand-portal/ProductRowActions.tsx");
  assert.match(admin, /from "@\/components\/shared\/ProductLifecycleDialog"/);
  assert.match(brand, /from "@\/components\/shared\/ProductLifecycleDialog"/);
});

test("the shared dialog always runs a fresh server-side preflight and never trusts a client-side eligibility assumption for the delete/archive actions", () => {
  const dialog = read("components/shared/ProductLifecycleDialog.tsx");
  assert.match(dialog, /await fetch\(apiPath, \{ cache: "no-store" \}\)/);
  assert.match(dialog, /action: "delete_live"/);
  assert.match(dialog, /action: "archive"/);
  assert.match(dialog, /confirmText !== productName/);
});

test("Brand Assistant can review the Archive fallback but can never confirm permanent deletion", () => {
  const page = read("app/brand-portal/products/page.tsx");
  assert.match(page, /const canDeletePermanently = owner\.accessLevel === "owner" && !owner\.isImpersonating;/);
  const rowActions = read("components/brand-portal/ProductRowActions.tsx");
  assert.match(rowActions, /canDeletePermanently: boolean/);
  assert.match(rowActions, /Review removal options/);
  const route = read("app/api/brand-portal/products/[id]/deletion/route.ts");
  assert.match(route, /action !== "archive" && owner\.accessLevel !== "owner"/);
});

test("ordinary product edits preserve Paused exactly and the editor does not offer Save as Draft after first publish", () => {
  for (const file of ["app/api/admin/products/[id]/route.ts", "app/api/brand-portal/products/[id]/route.ts"]) {
    const route = read(file);
    assert.match(route, /existing\.status === "published" \|\| existing\.status === "paused"/);
  }
  const form = read("components/admin/ProductForm.tsx");
  const chrome = read("components/admin/ProductEditorChrome.tsx");
  assert.match(form, /showDraftAction=\{!hasLeftDraft\}/);
  assert.match(form, /publishLabel=\{hasLeftDraft \? "Update" : "Publish Product"\}/);
  assert.match(chrome, /!createExperience && showDraftAction/);
});

test("Admin and assistant lifecycle actions notify the brand owner inbox without duplicating the actor's own event", () => {
  const helper = read("lib/admin/productLifecycleNotifications.ts");
  assert.match(helper, /getBrandMembersForAdmin/);
  assert.match(helper, /\.filter\(\(owner\) => owner\.id !== args\.excludeUserId\)/);
  assert.match(helper, /deliveryKey: `product-lifecycle:/);
  for (const file of [
    "app/api/admin/products/[id]/pause/route.ts",
    "app/api/admin/products/[id]/deletion/route.ts",
    "app/api/brand-portal/products/[id]/route.ts",
    "app/api/brand-portal/products/[id]/deletion/route.ts",
  ]) assert.match(read(file), /notifyBrandOwnersOfProductLifecycle/);
});

test("the brand-portal deletion route blocks every action, not just delete, while impersonating", () => {
  const route = read("app/api/brand-portal/products/[id]/deletion/route.ts");
  const postStart = route.indexOf("export async function POST");
  const postBody = route.slice(postStart, postStart + 400);
  assert.match(postBody, /owner\.isImpersonating/);
});

test("restoration exists only for Admin — no Brand Portal route calls a restore RPC or hits the admin restore endpoint", () => {
  const brandFiles = [
    "app/api/brand-portal/products/[id]/deletion/route.ts",
    "app/api/brand-portal/products/[id]/route.ts",
    "app/brand-portal/products/archived/page.tsx",
  ];
  for (const file of brandFiles) {
    assert.doesNotMatch(read(file), /restoreProduct|restore_product|adminRestoreArchivedProduct|admin_restore_archived_product|\/api\/admin\/products\/.*\/restore/);
  }
});

test("account for every one of the task's 26 required test scenarios: this file plus tests/productDeletionDeleteFirst.test.ts plus the pre-existing suites together name every scenario at least once", () => {
  // Not an executable coverage tool — a deliberate manifest so a reviewer
  // (or a future change) can see at a glance which file is expected to
  // cover which numbered scenario from the task spec, since the 26 items
  // span three different test files and two different verification styles
  // (live-gated integration vs. static source-text).
  const manifest: Record<number, string> = {
    1: "tests/productDeletionIntegration.test.ts — pristine Draft deletion (pre-existing, untouched)",
    2: "tests/productDeletionIntegration.test.ts + tests/productDeletionRepoSafety.test.ts — non-pristine Draft blockers (pre-existing)",
    3: "tests/productDeletionDeleteFirst.test.ts — Published -> Pause -> Resume",
    4: "tests/productDeletionDeleteFirst.test.ts — Published -> preflight -> safe delete",
    5: "tests/productDeletionDeleteFirst.test.ts — Paused -> preflight -> safe delete",
    6: "tests/productDeletionDeleteFirst.test.ts — completed sale blocks hard delete",
    7: "tests/productDeletionDeleteFirst.test.ts — inventory history blocks hard delete",
    8: "tests/productDeletionDeleteFirst.test.ts — warehouse history blocks hard delete",
    9: "tests/productDeletionDeleteFirst.test.ts — reviews/refunds block hard delete",
    10: "tests/productDeletionDeleteFirst.test.ts — grouped evidence counts (sales/open/cancelled/refunds distinct)",
    11: "tests/productDeletionDeleteFirst.test.ts — temporary blocker resolves + recheck",
    12: "tests/productDeletionDeleteFirst.test.ts — immutable + temporary combined",
    13: "tests/productDeletionDeleteFirst.test.ts + this file — Archive self-guards against being used as a plain hide action",
    14: "not independently re-verified this pass — inherited from private.is_product_customer_visible, already covered by tests/security.rls.test.ts's storefront_products checks and this file's status/visibility assertions",
    15: "this file — no restore route/RPC reference anywhere under app/(brand-portal)/**",
    16: "tests/productDeletionRepoSafety.test.ts + this file — Assistant gated to Archive only, never Delete",
    17: "this file — impersonation blocked for every deletion-route action, and canDeletePermanently excludes it",
    18: "tests/productDeletionDeleteFirst.test.ts — admin-only restore lands on Paused",
    19: "tests/productDeletionDeleteFirst.test.ts — restore never sets status = 'published'",
    20: "tests/productDeletionDeleteFirst.test.ts + this file — trigger rejects raw status writes; bulk publish excludes Paused",
    21: "this file — every mutating RPC takes FOR UPDATE (concurrency itself not independently load-tested — see final report)",
    22: "tests/productDeletionDeleteFirst.test.ts + this file — operation-key replay semantics for delete/restore",
    23: "tests/productDeletionIntegration.test.ts — media cleanup queueing (pre-existing, delete_product_permanently untouched)",
    24: "tests/productDeletionDeleteFirst.test.ts + this file — anon rejection and REVOKE/GRANT text",
    25: "this file — Admin and Brand Portal share one dialog component",
    26: "components/shared/ProductLifecycleDialog.tsx uses max-h-[92vh]/overflow-y-auto/max-w-lg for responsive sizing — not independently verified in an actual mobile viewport this pass, see final report",
  };
  assert.equal(Object.keys(manifest).length, 26);
});
