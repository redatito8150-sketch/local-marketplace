import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8");

test("account deletion requires a recent verified session and same-origin request", () => {
  const route = read("app/api/account/delete/route.ts");
  const auth = read("lib/supabase/accountAuth.ts");
  assert.match(route, /isSameOrigin\(request\)/);
  assert.match(route, /getRecentUserAuthState/);
  assert.match(route, /RECENT_AUTH_REQUIRED/);
  assert.match(auth, /auth\.getClaims\(\)/);
  assert.match(auth, /is_recent_auth_session/);
});

test("account deletion migration redacts retained orders and removes blocking content", () => {
  const sql = read("supabase/migrations/20260810000007_account_deletion_and_identity_consistency.sql");
  assert.match(sql, /before delete on auth\.users/i);
  assert.match(sql, /delete from public\.reviews where user_id = old\.id/i);
  assert.match(sql, /shipping_email = 'deleted\+' \|\| id::text \|\| '@example\.invalid'/i);
  assert.match(sql, /shipping_phone = 'REDACTED'/i);
  assert.match(sql, /internal_notes = null/i);
  assert.match(sql, /references public\.brand_applications\(id\) on delete cascade/i);
  assert.match(sql, /references public\.brand_applications\(id\) on delete set null/i);
});

test("storage cleanup is durable, service-only, and has an authenticated cron retry", () => {
  const sql = read("supabase/migrations/20260810000007_account_deletion_and_identity_consistency.sql");
  const cleanup = read("lib/account/storageCleanup.ts");
  const cron = read("app/api/cron/storage-cleanup/route.ts");
  const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
  assert.match(sql, /create table if not exists public\.storage_cleanup_jobs/i);
  assert.match(sql, /revoke all on public\.storage_cleanup_jobs from public, anon, authenticated/i);
  assert.match(cleanup, /brand-application-documents/);
  assert.match(cleanup, /review-images/);
  assert.match(cleanup, /product-images/);
  assert.match(cron, /Bearer \$\{cronSecret\}/);
  // Not an exact-equal on the whole array — the product deletion lifecycle
  // migration (supabase/migrations/20260814020000_product_deletion_lifecycle.sql)
  // legitimately added a second, independent cron entry
  // (/api/cron/product-deletions) alongside this one.
  assert.ok(
    vercel.crons.some((entry) => entry.path === "/api/cron/storage-cleanup" && entry.schedule === "0 3 * * *"),
    "expected the storage-cleanup cron entry to still be present"
  );
});

test("confirmed auth email changes synchronize the profile mirror", () => {
  const sql = read("supabase/migrations/20260810000007_account_deletion_and_identity_consistency.sql");
  assert.match(sql, /after update of email on auth\.users/i);
  assert.match(sql, /update public\.profiles\s+set email = new\.email/i);
});

test("mobile catalog no longer selects the removed compare_at_price column", () => {
  const products = read("apps/mobile/src/domain/products.ts");
  const card = read("apps/mobile/src/components/catalog/ProductCard.tsx");
  const detail = read("apps/mobile/app/products/[id].tsx");
  assert.doesNotMatch(products, /compare_at_price/);
  assert.doesNotMatch(card, /compare_at_price/);
  assert.doesNotMatch(detail, /compare_at_price/);
  assert.match(products, /discount_percent/);
  assert.match(products, /discount_ends_at/);
  assert.match(products, /variant_discount_percent/);
});

test("ordinary signed-in sessions cannot unlock the recovery form", () => {
  const reset = read("app/reset-password/page.tsx");
  assert.match(reset, /PASSWORD_RECOVERY/);
  assert.match(reset, /sessionStorage\.getItem\(RECOVERY_MARKER\)/);
  assert.doesNotMatch(reset, /getSession\(\)[\s\S]*setReady/);
});
