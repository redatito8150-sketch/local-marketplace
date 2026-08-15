import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Repo-wide safety checks for the product-launch-policy / opening-stock
// redesign: no product-creation UI collects stock, no checkout path still
// keys visibility off fulfillment_mode instead of launch_policy, and the
// new database-authoritative predicate is actually reused everywhere it
// needs to be, not duplicated.

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

const appLibComponentFiles = [
  ...walk(path.join(rootDir, "app")),
  ...walk(path.join(rootDir, "lib")),
  ...walk(path.join(rootDir, "components")),
];

function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("no product-creation/editing component collects an Opening Stock or live quantity value", () => {
  const offenders: string[] = [];
  for (const file of appLibComponentFiles) {
    const relative = path.relative(rootDir, file).replace(/\\/g, "/");
    if (!relative.startsWith("components/admin/") && !relative.startsWith("lib/admin/")) continue;
    const content = readFileSync(file, "utf8");
    if (/openingStock/.test(content)) offenders.push(relative);
  }
  assert.deepEqual(offenders, [], `found a lingering openingStock reference in: ${offenders.join(", ")}`);
});

test("create_variant_with_opening_stock's TS caller (variantPersistence.ts) always sends 0, never a client-supplied value — old/stale clients cannot smuggle stock through the API", () => {
  const src = read("lib/admin/variantPersistence.ts");
  const occurrences = src.match(/p_opening_stock:[^,\n]*/g) ?? [];
  assert.equal(occurrences.length, 1, "expected exactly one p_opening_stock reference");
  assert.match(occurrences[0], /^p_opening_stock:\s*0\s*$/);
  assert.doesNotMatch(src, /openingStock/);
});

test("publish-readiness validation no longer requires positive quantity for anyone — only an Active variant", () => {
  const src = read("lib/admin/productValidation.ts");
  assert.doesNotMatch(src, /v\.quantity > 0/);
  assert.doesNotMatch(src, /needs stock and an Active Selling Status/);
  assert.match(src, /At least one variant needs an Active Selling Status before publishing/);
});

test("no checkout/visibility code still keys launch-gating off brands.fulfillment_mode — the explicit products.launch_policy column is the only source of truth for this decision", () => {
  const checkoutFiles = [
    "app/api/orders/route.ts",
    "lib/payments/intentionCart.ts",
    "app/api/payments/paymob/intention/route.ts",
  ];
  for (const relative of checkoutFiles) {
    const content = read(relative);
    assert.doesNotMatch(content, /fulfillment_mode/, `${relative} should no longer reference fulfillment_mode for the launch gate`);
    assert.match(content, /launch_policy/, `${relative} should read launch_policy`);
  }
});

test("back-in-stock delivery is fenced, channel-idempotent, retryable by cron, and exposes only active subscriptions", () => {
  const src = read("lib/backInStock.ts");
  // CORRECTIVE PASS: subscriptions are no longer deleted before delivery
  // (which had no recovery path on a crash/failure between delete and
  // send). claim_back_in_stock_deliveries (supabase/migrations/
  // 20260815000000_product_launch_policy_and_opening_stock.sql) atomically
  // claims each eligible row into a leased 'claimed' state, checking
  // product-level visibility as PART of the same claiming UPDATE — not a
  // separate, staleable read — so a concurrent worker can never double-claim
  // and a crash before delivery is retried, not silently discarded.
  const fnBody = src.slice(src.indexOf("export async function processBackInStockDeliveries"));
  assert.match(fnBody, /supabaseAdmin\.rpc\("claim_back_in_stock_deliveries"/);
  assert.match(src, /supabaseAdmin\.rpc\("mark_back_in_stock_delivery_channel_sent"/);
  assert.match(src, /supabaseAdmin\.rpc\("mark_back_in_stock_delivery_failed"/);
  // Every delivery outcome (email failure, notifyUser failure, no
  // resolvable detail) is explicitly reported back — never left claimed
  // forever, never silently treated as sent.
  assert.match(fnBody, /if \(!emailResult\.ok\)/);
  assert.match(fnBody, /if \(!notifyResult\.ok\)/);
  assert.match(src, /p_claim_token: claim\.claim_token/);
  assert.match(src, /idempotencyKey: `back-in-stock-\$\{claim\.id\}-email`/);
  assert.match(src, /deliveryKey: `back-in-stock-\$\{claim\.id\}-notification`/);
  assert.match(src, /\.in\("delivery_status", \["pending", "claimed"\]\)/);

  const cron = read("app/api/cron/back-in-stock-deliveries/route.ts");
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /processBackInStockDeliveries\(\)/);
  const vercelConfig = read("vercel.json");
  assert.match(vercelConfig, /"path":\s*"\/api\/cron\/back-in-stock-deliveries"/);
  assert.match(vercelConfig, /"schedule":\s*"15 3 \* \* \*"/);
});

test("New Arrivals (lib/newArrivals.ts + lib/data/products.ts's getNewArrivals) uses first_visible_at, never publish_date, for both the window membership and the ranking", () => {
  const newArrivalsSrc = read("lib/newArrivals.ts");
  assert.match(newArrivalsSrc, /export function isWithinNewArrivalWindow\(status: string, firstVisibleAt: string \| null \| undefined\)/);

  const productsSrc = read("lib/data/products.ts");
  const fnBody = productsSrc.slice(
    productsSrc.indexOf("export async function getNewArrivals"),
    productsSrc.indexOf("export async function getAllActiveProducts")
  );
  assert.match(fnBody, /\.not\("first_visible_at", "is", null\)/);
  assert.match(fnBody, /\.gte\("first_visible_at", windowStart\)/);
  assert.match(fnBody, /\.order\("first_visible_at", \{ ascending: false \}\)/);
  // publish_date is still mentioned in this function's own explanatory
  // comment (why it's no longer used) — only the actual Supabase query
  // chain must never filter/sort by it.
  assert.doesNotMatch(fnBody, /\.(eq|gte|lte|order|not)\("publish_date"/);
});

test("the explicit Show now override is only ever performed through the canonical set_product_launch_policy_show_now RPC — no raw Supabase .update({launch_policy...}) call exists anywhere", () => {
  const offenders: string[] = [];
  for (const file of appLibComponentFiles) {
    const relative = path.relative(rootDir, file).replace(/\\/g, "/");
    const content = readFileSync(file, "utf8");
    // Only a real write matters here — `.update({ launch_policy: ... })` or
    // `.insert({ launch_policy: ... })` against Supabase directly. Type
    // annotations (`launch_policy: "show_now" | "when_stocked"`) and
    // read-time display fallbacks (`row.launch_policy ?? "show_now"`) are
    // not writes and must not be flagged. Bounded to not cross a `}` (so an
    // unrelated later object literal, comment, or migration-filename
    // string elsewhere in the same file — e.g. "..._launch_policy_and_..."
    // in a corrective-pass doc comment — can't false-positive the match)
    // and requires an actual `launch_policy:` key, not just the bare
    // substring appearing anywhere downstream.
    if (/\.(update|insert)\(\s*\{[^}]*?launch_policy\s*:/.test(content)) {
      offenders.push(relative);
    }
  }
  assert.deepEqual(offenders, [], `found a raw launch_policy write outside the canonical RPC path in: ${offenders.join(", ")}`);

  assert.match(read("app/api/admin/products/[id]/show-now/route.ts"), /setProductLaunchPolicyShowNow/);
  assert.match(read("app/api/brand-portal/products/[id]/show-now/route.ts"), /setProductLaunchPolicyShowNow/);
  assert.match(read("app/api/brand-portal/products/[id]/show-now/route.ts"), /accessLevel !== "owner"/);
});

test("resume-from-pause (admin and brand-portal) calls stampFirstVisibleIfEligible — respecting launch policy + current stock, never auto-visible just because it was resumed", () => {
  const adminPause = read("app/api/admin/products/[id]/pause/route.ts");
  assert.match(adminPause, /if \(!paused\) await stampFirstVisibleIfEligible\(id\);/);

  const brandPortalRoute = read("app/api/brand-portal/products/[id]/route.ts");
  assert.match(brandPortalRoute, /if \(!paused\) await stampFirstVisibleIfEligible\(params\.id\);/);
});

test("scheduled visibility activation runs hourly in Supabase Cron, with an authenticated HTTP fallback", () => {
  const cron = read("app/api/cron/activate-product-visibility/route.ts");
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /request\.headers\.get\("authorization"\) !== `Bearer \$\{cronSecret\}`/);
  assert.match(cron, /execute_scheduled_product_visibility_activation/);

  const databaseCron = read("supabase/migrations/20260815214110_product_visibility_activation_cron.sql");
  assert.match(databaseCron, /create extension if not exists pg_cron;/);
  assert.match(databaseCron, /'product-visibility-activation',\s*'0 \* \* \* \*'/);
  assert.match(databaseCron, /select private\.execute_scheduled_product_visibility_activation\(200\);/);

  const vercelConfig = read("vercel.json");
  assert.doesNotMatch(vercelConfig, /"path":\s*"\/api\/cron\/activate-product-visibility"/);
});

test("the product editor's header no longer renders a Publish action in the create experience — only the bottom action bar does", () => {
  const chrome = read("components/admin/ProductEditorChrome.tsx");
  assert.match(chrome, /const showPublishAction = !createExperience;/);
});

test("Save as Draft is unconditionally available on every creation step (no hasPersistedProduct gate)", () => {
  const chrome = read("components/admin/ProductEditorChrome.tsx");
  const wizardBar = chrome.slice(chrome.indexOf("export function ProductWizardBottomBar"));
  assert.doesNotMatch(wizardBar, /hasPersistedProduct/);
  assert.match(wizardBar, /disabled=\{submitting\} onClick=\{onSaveDraft\}/);
});
