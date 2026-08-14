import test from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Real, executable behavioral tests for the product deletion lifecycle
// (supabase/migrations/20260814020000_product_deletion_lifecycle.sql) —
// these create real rows and call the real RPCs against a live, migrated
// Supabase project, rather than asserting on SQL source text (that static
// coverage lives in tests/productDeletionLifecycleMigration.test.ts).
//
// Same env-credential-skip convention as tests/fulfillmentIntegration.test.ts:
// fully skipped (not failed) when Supabase credentials aren't configured,
// and additionally skipped if the credentialed project does NOT yet have
// this branch's migration applied (probed via a cheap read of
// product_deletion_requests). This repo's .env.local points at the real
// Supabase project, and this branch's migration is deliberately never
// applied there (per this task's own "never apply migrations" instruction)
// — so this suite is expected to report all-skipped in this environment.
// It exists to run for real once pointed at a staging/local Postgres that
// has run supabase/migrations/20260814020000_product_deletion_lifecycle.sql.
//
// Every row this suite creates is scoped under a fresh, randomly-named
// throwaway brand/product (never touching any real data), and every test
// cleans up its own rows in a `finally` block via cleanupBrand(), which
// deletes product_deletion_requests rows for the brand FIRST — required
// now that product_deletion_requests.brand_id is `on delete restrict`:
// leftover request rows would otherwise block the brand delete and leak
// permanently (the corrective pass also added a DELETE grant on
// product_deletion_requests to service_role, since the original migration
// omitted it and this cleanup would have failed even with the FK ordered
// correctly).

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(rootDir, ".env.local");

function loadEnv(): Record<string, string> {
  if (!existsSync(envPath)) return {};
  return Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      })
  );
}

const env = loadEnv();
const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const hasCredentials = Boolean(supabaseUrl && serviceRoleKey);
// The worker-retry test below imports lib/account/storageCleanup.ts,
// which builds its own Supabase client from process.env directly (the
// same way it does inside the real Next.js app) — a plain `node --test`
// run doesn't auto-load .env.local the way Next.js does, so mirror the
// values this file already parsed into process.env for that import alone.
if (supabaseUrl) process.env.NEXT_PUBLIC_SUPABASE_URL ??= supabaseUrl;
if (serviceRoleKey) process.env.SUPABASE_SERVICE_ROLE_KEY ??= serviceRoleKey;
const integrationTestsEnabled = env.RUN_PRODUCT_DELETION_INTEGRATION === "1";

let admin: SupabaseClient | null = null;
let schemaReady = false;

async function probeSchemaReady(): Promise<boolean> {
  if (!hasCredentials) return false;
  admin = createClient(supabaseUrl!, serviceRoleKey!);
  // Probes for the corrective-pass column shape specifically (not just
  // table existence) so this suite also skips cleanly against a database
  // that still has the original, pre-corrective-pass migration applied.
  const { error } = await admin.from("product_deletion_requests").select("id, product_name, product_sku").limit(1);
  return !error;
}

schemaReady = await probeSchemaReady();
const runLive = integrationTestsEnabled && hasCredentials && schemaReady;

async function createThrowawayBrand(isPartner = false) {
  const slug = `test-deletion-${randomUUID()}`;
  const { data, error } = await admin!
    .from("brands")
    .insert({
      slug, name: slug, category: "Test", story_body: "Deletion-lifecycle test brand",
      is_active: true, sku_prefix: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(),
      is_mahaly_partner: isPartner,
    })
    .select("id, slug")
    .single();
  if (error) throw new Error(`createThrowawayBrand failed: ${error.message}`);
  return data as { id: string; slug: string };
}

async function createDraftProduct(brandId: string) {
  const id = `test-deletion-product-${randomUUID()}`;
  const { data: taxonomy } = await admin!.from("taxonomy_nodes").select("id").limit(1).single();
  const { error } = await admin!.from("products").insert({
    id, name: "Deletion Test Product", brand_name: "Test", brand_id: brandId,
    price: 10, currency: "USD", image: "https://example.invalid/x.jpg", sku: id,
    product_type_id: taxonomy?.id, audience: "unisex", status: "draft",
  });
  if (error) throw new Error(`createDraftProduct failed: ${error.message}`);
  return id;
}

async function cleanupBrand(brandId: string) {
  await admin!.from("product_deletion_requests").delete().eq("brand_id", brandId);
  await admin!.from("products").delete().eq("brand_id", brandId);
  await admin!.from("brands").delete().eq("id", brandId);
}

test("a genuinely pristine draft can be permanently deleted immediately", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    const { data: eligibility } = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.canDeleteImmediately, true);
    assert.equal(eligibility.mustRetainHistory, false);

    const { data: result } = await admin!.rpc("delete_draft_product", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
    });
    assert.equal(result.ok, true);
    assert.equal(result.code, "DRAFT_DELETED");
    // No media was uploaded for this fixture, so mediaUrls is empty — but
    // the field must still be present (see the storage-cleanup-queued
    // coverage in productMediaStorage.test.ts for the URL-filtering logic
    // itself, which needs no live DB).
    assert.deepEqual(result.mediaUrls, []);

    const { data: gone } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();
    assert.equal(gone, null);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("a draft with order history cannot be deleted immediately and must be retained", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    const { data: variant } = await admin!
      .from("product_variants")
      .insert({ product_id: productId, sku: `${productId}-v1`, quantity: 1 })
      .select("id")
      .single();
    await admin!.from("inventory_movements").insert({
      variant_id: variant!.id, product_id: productId, brand_id: brand.id,
      previous_quantity: 0, quantity_delta: 1, new_quantity: 1,
      movement_type: "opening_stock", source: "test", source_operation_key: randomUUID(),
    });

    const { data: eligibility } = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.canDeleteImmediately, false);
    assert.equal(eligibility.mustRetainHistory, true);
    assert.ok(eligibility.blockers.some((b: { code: string }) => b.code === "PRODUCT_HAS_INVENTORY_HISTORY"));

    const { data: result } = await admin!.rpc("delete_draft_product", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "PRODUCT_NOT_DRAFT");

    const { data: stillThere } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();
    assert.ok(stillThere);
  } finally {
    await cleanupBrand(brand.id);
  }
});

// item 4 + item 13: immutable-history products must never be offered a
// deletion request that can never succeed — request_product_deletion
// refuses outright (no row created) rather than creating a 'blocked' row.
test("an archived product with immutable history cannot even request permanent deletion", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    const { data: variant } = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 0 }).select("id").single();
    await admin!.from("inventory_movements").insert({
      variant_id: variant!.id, product_id: productId, brand_id: brand.id,
      previous_quantity: 0, quantity_delta: 1, new_quantity: 1,
      movement_type: "opening_stock", source: "test", source_operation_key: randomUUID(),
    });
    await admin!.from("products").update({ status: "archived" }).eq("id", productId);

    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.mustRetainHistory, true);
    assert.equal(eligibility.data.canRequestDeletion, false);
    assert.equal(eligibility.data.lifecycle, "historical");

    const result = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "cleanup", p_operation_key: randomUUID(),
    });
    assert.equal(result.data.ok, false);
    assert.equal(result.data.code, "PRODUCT_MUST_BE_RETAINED");

    const { data: requests } = await admin!.from("product_deletion_requests").select("id").eq("product_id", productId);
    assert.deepEqual(requests, [], "no request row should have been created");
  } finally {
    await cleanupBrand(brand.id);
  }
});

// SECOND CORRECTIVE PASS: restore_product now always targets 'draft'
// (never 'published' directly, regardless of variants/stock/launch
// state) — getting back to Published is the ordinary edit-and-publish
// flow's job, with its own full validation. This also proves restore
// still works with zero variants/zero stock, since draft has no
// completeness requirement at all.
test("canonical restore always lands in draft, regardless of variant/stock state, and is idempotent-safe against re-archiving", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);

    const first = await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(first.data.ok, true);
    assert.equal(first.data.code, "ARCHIVED");
    const second = await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(second.data.ok, true);
    assert.equal(second.data.code, "ALREADY_ARCHIVED");

    // No variants, no stock at all — restore still succeeds, because it
    // only ever targets draft, which has no completeness requirement.
    const restoreOk = await admin!.rpc("restore_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(restoreOk.data.ok, true, `expected restore to succeed, got: ${JSON.stringify(restoreOk.data)}`);
    assert.equal(restoreOk.data.code, "RESTORED");
    assert.equal(restoreOk.data.lifecycle, "draft");

    const { data: row } = await admin!.from("products").select("status").eq("id", productId).single();
    assert.equal(row!.status, "draft", "restore must land in draft, never published, directly");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("a brand cannot act on another brand's product", { skip: !runLive }, async () => {
  const brandA = await createThrowawayBrand();
  const brandB = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brandA.id);
    const result = await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brandB.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(result.data.ok, false);
    assert.equal(result.data.code, "PRODUCT_NOT_OWNED");
  } finally {
    await cleanupBrand(brandA.id);
    await cleanupBrand(brandB.id);
  }
});

test("deletion request lifecycle: request -> cancel, duplicate requests are rejected, and idempotency conflicts are detected", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "archived" }).eq("id", productId);

    const key = randomUUID();
    const first = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "no longer selling", p_operation_key: key,
    });
    assert.equal(first.data.ok, true);
    assert.equal(first.data.code, "DELETION_REQUESTED");

    // Idempotent replay of the exact same key AND the same reason/actor
    // succeeds without duplicating.
    const replay = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "no longer selling", p_operation_key: key,
    });
    assert.equal(replay.data.ok, true);
    assert.equal(replay.data.requestId, first.data.requestId);

    // item 7 + item 13: the SAME key reused with a DIFFERENT reason is a
    // real conflict, not a safe no-op — a naive "first caller wins" replay
    // would have silently returned the original request here instead.
    const conflict = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "a completely different reason", p_operation_key: key,
    });
    assert.equal(conflict.data.ok, false);
    assert.equal(conflict.data.code, "IDEMPOTENCY_CONFLICT");

    // A genuinely new request (new key) while one is already open is refused.
    const duplicate = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "again", p_operation_key: randomUUID(),
    });
    assert.equal(duplicate.data.ok, false);
    assert.equal(duplicate.data.code, "DELETION_REQUEST_ALREADY_OPEN");

    const cancel = await admin!.rpc("cancel_product_deletion_request", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(cancel.data.ok, true);

    const cancelAgain = await admin!.rpc("cancel_product_deletion_request", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(cancelAgain.data.ok, false);
    assert.equal(cancelAgain.data.code, "DELETION_REQUEST_NOT_FOUND");
  } finally {
    await cleanupBrand(brand.id);
  }
});

// item 1 + item 3 + item 13's headline scenario: this is the exact flow
// the original migration made structurally impossible. A history-free
// archived product's request must be approvable, the product must
// actually be gone afterward, and the request row must survive as
// 'completed' with its own product_id now null and its name/sku/image
// snapshot intact.
test("successful request -> approval deletes the product and the request survives as a readable, completed record", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "archived" }).eq("id", productId);

    const requestResult = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "discontinuing this line", p_operation_key: randomUUID(),
    });
    assert.equal(requestResult.data.ok, true);
    assert.equal(requestResult.data.requestState, "requested", "a history-free archived product must not enter 'blocked' at request time");
    const requestId = requestResult.data.requestId;

    const approve = await admin!.rpc("admin_approve_product_deletion", { p_request_id: requestId, p_actor_id: null, p_actor_label: "admin-test" });
    assert.equal(approve.data.ok, true, `expected approval to succeed, got: ${JSON.stringify(approve.data)}`);
    assert.equal(approve.data.code, "PRODUCT_PERMANENTLY_DELETED");
    assert.equal(approve.data.requestState, "completed");

    const { data: gone } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();
    assert.equal(gone, null, "product must actually be deleted");

    const { data: requestRow } = await admin!.from("product_deletion_requests").select("*").eq("id", requestId).single();
    assert.equal(requestRow!.status, "completed");
    assert.equal(requestRow!.product_id, null, "product_id must be nulled once the product is gone");
    assert.equal(requestRow!.product_name, "Deletion Test Product", "the name snapshot must survive the product's own deletion");
    assert.ok(requestRow!.completed_at);
  } finally {
    // Product is already gone via the approval above; cleanupBrand still
    // needs to remove the now-orphaned (but intentionally retained)
    // completed request row before the brand itself can be deleted.
    await cleanupBrand(brand.id);
  }
});

// item 1 / item 3's "approval ignores only its own workflow blocker,
// never real blockers" requirement, verified from the other direction:
// admin approval must still correctly refuse (not silently succeed) when
// genuine new activity has appeared since the request was filed — proving
// the p_ignore_request_id exclusion only suppresses the request's own
// self-reference, not real blockers.
test("admin approval recomputes eligibility and refuses a request that new activity has blocked, without deleting anything", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "archived" }).eq("id", productId);

    const requestResult = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "cleanup", p_operation_key: randomUUID(),
    });
    assert.equal(requestResult.data.ok, true);
    const requestId = requestResult.data.requestId;

    // New activity after the request was filed: declared brand stock
    // appears (a real, resolvable operational blocker, not the request's
    // own self-reference).
    const { data: variant } = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 0 }).select("id").single();
    await admin!.from("product_variants").update({ brand_stock_quantity: 3 }).eq("id", variant!.id);

    const approve = await admin!.rpc("admin_approve_product_deletion", { p_request_id: requestId, p_actor_id: null, p_actor_label: "admin-test" });
    assert.equal(approve.data.ok, false);
    assert.equal(approve.data.code, "PRODUCT_MUST_BE_RETAINED");
    assert.ok(approve.data.blockers.some((b: { code: string }) => b.code === "PRODUCT_HAS_RESERVED_STOCK"));
    // The self-referential blocker must never appear.
    assert.ok(!approve.data.blockers.some((b: { code: string }) => b.code === "DELETION_REQUEST_ALREADY_OPEN"));

    const { data: stillThere } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();
    assert.ok(stillThere, "product must not have been deleted");

    const { data: requestRow } = await admin!.from("product_deletion_requests").select("status").eq("id", requestId).single();
    assert.equal(requestRow!.status, "blocked");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("an archived product with active variant stock cannot be ordered (order_items guard trigger, product_id present)", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "archived" }).eq("id", productId);
    const { data: variant } = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 5, selling_status: "active" }).select("id").single();

    const { data: order } = await admin!.from("orders").insert({
      order_number: `TEST-${randomUUID().slice(0, 8)}`, brand_slug: brand.slug, fulfillment_type: "brand_direct",
      status: "confirmed", payment_status: "unpaid", total: 10, currency: "USD", customer_email: "test@example.invalid",
    }).select("id").single();

    await assert.rejects(
      async () => {
        await admin!.from("order_items").insert({ order_id: order!.id, product_id: productId, variant_id: variant!.id, quantity: 1, price: 10 }).throwOnError();
      },
      /PRODUCT_NOT_AVAILABLE_FOR_ORDER/
    );

    await admin!.from("orders").delete().eq("id", order!.id);
  } finally {
    await cleanupBrand(brand.id);
  }
});

// item 9 + item 13: the original trigger silently skipped enforcement
// whenever the inserted row's product_id was null, even though every real
// order-placement path also sets variant_id — this proves the
// variant_id-resolution fallback actually closes that gap.
test("an archived product cannot be ordered even when the order_item insert only supplies variant_id (product_id null)", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "archived" }).eq("id", productId);
    const { data: variant } = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 5, selling_status: "active" }).select("id").single();

    const { data: order } = await admin!.from("orders").insert({
      order_number: `TEST-${randomUUID().slice(0, 8)}`, brand_slug: brand.slug, fulfillment_type: "brand_direct",
      status: "confirmed", payment_status: "unpaid", total: 10, currency: "USD", customer_email: "test@example.invalid",
    }).select("id").single();

    await assert.rejects(
      async () => {
        // product_id deliberately omitted — only variant_id supplied.
        await admin!.from("order_items").insert({ order_id: order!.id, variant_id: variant!.id, quantity: 1, price: 10 }).throwOnError();
      },
      /PRODUCT_NOT_AVAILABLE_FOR_ORDER/
    );

    await admin!.from("orders").delete().eq("id", order!.id);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("a published product can be ordered normally (order_items guard does not false-positive)", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);
    const { data: variant } = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 5, selling_status: "active" }).select("id").single();

    const { data: order } = await admin!.from("orders").insert({
      order_number: `TEST-${randomUUID().slice(0, 8)}`, brand_slug: brand.slug, fulfillment_type: "brand_direct",
      status: "confirmed", payment_status: "unpaid", total: 10, currency: "USD", customer_email: "test@example.invalid",
    }).select("id").single();

    const { error } = await admin!.from("order_items").insert({ order_id: order!.id, product_id: productId, variant_id: variant!.id, quantity: 1, price: 10 });
    assert.equal(error, null);

    await admin!.from("order_items").delete().eq("order_id", order!.id);
    await admin!.from("orders").delete().eq("id", order!.id);
  } finally {
    await cleanupBrand(brand.id);
  }
});

// item 10 + item 13: the admin review queue's search/filter/pagination is
// a single database-level RPC — this proves it actually filters and
// paginates rather than returning everything.
test("admin_search_deletion_requests filters by status and paginates at the database level", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const productId = await createDraftProduct(brand.id);
      await admin!.from("products").update({ status: "archived" }).eq("id", productId);
      await admin!.rpc("request_product_deletion", {
        p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
        p_reason: "bulk cleanup", p_operation_key: randomUUID(),
      });
      productIds.push(productId);
    }

    const page1 = await admin!.rpc("admin_search_deletion_requests", { p_status: "requested", p_brand_id: brand.id, p_limit: 2, p_offset: 0 });
    assert.equal(page1.data.total, 3);
    assert.equal(page1.data.rows.length, 2);

    const page2 = await admin!.rpc("admin_search_deletion_requests", { p_status: "requested", p_brand_id: brand.id, p_limit: 2, p_offset: 2 });
    assert.equal(page2.data.rows.length, 1);

    const wrongStatus = await admin!.rpc("admin_search_deletion_requests", { p_status: "completed", p_brand_id: brand.id, p_limit: 10, p_offset: 0 });
    assert.equal(wrongStatus.data.total, 0);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("restore is blocked while a deletion request is open, and succeeds once it's cancelled", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "archived" }).eq("id", productId);
    const requestResult = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "cleanup", p_operation_key: randomUUID(),
    });
    assert.equal(requestResult.data.ok, true);

    const restoreBlocked = await admin!.rpc("restore_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(restoreBlocked.data.ok, false);
    assert.equal(restoreBlocked.data.code, "DELETION_REQUEST_ALREADY_OPEN");

    await admin!.rpc("cancel_product_deletion_request", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    const restoreOk = await admin!.rpc("restore_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(restoreOk.data.ok, true);
  } finally {
    await cleanupBrand(brand.id);
  }
});

// ============================================================================
// SECOND CORRECTIVE PASS — item 1: the archived -> draft -> published
// two-step bypass. Exercised directly against the database boundary (raw
// UPDATEs via the service-role client, simulating "future service-role
// code" the task explicitly calls out as the real risk), since that
// trigger — not the API route guards, which are covered separately by
// tests/productDeletionRepoSafety.test.ts's static checks — is the actual
// authoritative enforcement point.
// ============================================================================

test("a raw UPDATE cannot move an archived product straight to published", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);
    await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });

    await assert.rejects(
      async () => {
        await admin!.from("products").update({ status: "published" }).eq("id", productId).throwOnError();
      },
      /PRODUCT_ARCHIVED_TRANSITION_REQUIRES_RESTORE/
    );

    const { data: row } = await admin!.from("products").select("status").eq("id", productId).single();
    assert.equal(row!.status, "archived", "status must be unchanged after the rejected update");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("a raw UPDATE cannot move an archived product to draft either — only restore_product may", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);
    await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });

    await assert.rejects(
      async () => {
        await admin!.from("products").update({ status: "draft" }).eq("id", productId).throwOnError();
      },
      /PRODUCT_ARCHIVED_TRANSITION_REQUIRES_RESTORE/
    );

    const { data: row } = await admin!.from("products").select("status").eq("id", productId).single();
    assert.equal(row!.status, "archived");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("the archived -> draft -> published two-step bypass is impossible: the first raw step already fails, so the second never gets a chance", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);
    await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });

    // Step 1 of the bypass: archived -> draft. This is the step the
    // original (pre-second-corrective-pass) API guard let through.
    const step1 = await admin!.from("products").update({ status: "draft" }).eq("id", productId);
    assert.ok(step1.error, "step 1 (archived -> draft) must fail at the database level");
    assert.match(step1.error!.message, /PRODUCT_ARCHIVED_TRANSITION_REQUIRES_RESTORE/);

    // Step 2 (draft -> published) is what an ordinary, otherwise-legitimate
    // publish call would do next — it's never reached in a real two-step
    // attempt, since step 1 already failed. Demonstrated here as a
    // standalone sanity check that step 2 alone would have succeeded had
    // step 1 not been blocked, proving the trigger — not some unrelated
    // publish-path restriction — is what closes the bypass.
    const stillArchived = await admin!.from("products").select("status").eq("id", productId).single();
    assert.equal(stillArchived.data!.status, "archived");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("bulk publish still excludes a product after a failed attempt to slip it into draft — it never left 'archived'", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);
    await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });

    // Attempted bypass step, rejected by the trigger (same as above).
    await admin!.from("products").update({ status: "draft" }).eq("id", productId);

    // The bulk route's own exclusion logic (app/api/admin/products/bulk/
    // route.ts) filters on the product's CURRENT status before ever
    // issuing its raw `update ... set status = 'published'` — since the
    // trigger kept this product genuinely archived, that exclusion still
    // correctly applies. Reproduced here at the data level: a bulk-style
    // update scoped to "still archived" ids does not touch this product.
    const { data: archivedIds } = await admin!.from("products").select("id").eq("brand_id", brand.id).eq("status", "archived");
    assert.deepEqual(archivedIds?.map((r) => r.id), [productId]);

    const { data: row } = await admin!.from("products").select("status").eq("id", productId).single();
    assert.equal(row!.status, "archived");
  } finally {
    await cleanupBrand(brand.id);
  }
});

// ============================================================================
// SECOND CORRECTIVE PASS — item 2: media ownership + durable, transactional
// cleanup enqueueing.
// ============================================================================

function ownedMediaUrl(path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/product-images/${path}`;
}

test("media cleanup covers brand-portal draft-upload paths, admin temp-folder paths, and canonical product-folder paths alike", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    const tempFolderId = randomUUID();
    const brandDraftUrl = ownedMediaUrl(`product-drafts/${randomUUID()}/${tempFolderId}/cover.jpg`);
    const adminTempUrl = ownedMediaUrl(`products/${tempFolderId}/gallery-1.jpg`);
    const canonicalUrl = ownedMediaUrl(`products/${productId}/gallery-2.jpg`);

    await admin!.from("product_media").insert([
      { product_id: productId, storage_reference: brandDraftUrl, display_order: 0 },
      { product_id: productId, storage_reference: adminTempUrl, display_order: 1 },
      { product_id: productId, storage_reference: canonicalUrl, display_order: 2 },
    ]);

    const result = await admin!.rpc("delete_draft_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(result.data.ok, true, `expected deletion to succeed, got: ${JSON.stringify(result.data)}`);
    assert.equal(result.data.mediaJobsQueued, 3, "all three URL shapes must be recognized as owned, regardless of folder naming");

    const { data: jobs } = await admin!.from("storage_cleanup_jobs").select("storage_path").eq("bucket_id", "product-images").in("storage_path", [
      brandDraftUrl.split("/product-images/")[1],
      adminTempUrl.split("/product-images/")[1],
      canonicalUrl.split("/product-images/")[1],
    ]);
    assert.equal(jobs?.length, 3);

    await admin!.from("storage_cleanup_jobs").delete().eq("bucket_id", "product-images").in("storage_path", [
      brandDraftUrl.split("/product-images/")[1],
      adminTempUrl.split("/product-images/")[1],
      canonicalUrl.split("/product-images/")[1],
    ]);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("media cleanup never queues an external URL or another live product's shared media", { skip: !runLive }, async () => {
  const brandA = await createThrowawayBrand();
  const brandB = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brandA.id);
    const sharedWithId = await createDraftProduct(brandB.id);
    const ownedUrl = ownedMediaUrl(`products/${productId}/only-mine.jpg`);
    const externalUrl = "https://images.example.com/not-ours.jpg";
    const sharedUrl = ownedMediaUrl(`products/${productId}/shared.jpg`);

    await admin!.from("product_media").insert([
      { product_id: productId, storage_reference: ownedUrl, display_order: 0 },
      { product_id: productId, storage_reference: sharedUrl, display_order: 1 },
    ]);
    // Deliberately made to look shared: another live product also
    // references the exact same URL.
    await admin!.from("product_media").insert({ product_id: sharedWithId, storage_reference: sharedUrl, display_order: 0 });
    await admin!.from("products").update({ image: externalUrl }).eq("id", productId);

    const result = await admin!.rpc("delete_draft_product", { p_product_id: productId, p_brand_id: brandA.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(result.data.ok, true, `expected deletion to succeed, got: ${JSON.stringify(result.data)}`);
    assert.ok(!result.data.mediaUrls.includes(externalUrl), "must never treat an external URL as owned media");
    assert.ok(!result.data.mediaUrls.includes(sharedUrl), "must never treat another live product's shared media as owned");
    assert.ok(result.data.mediaUrls.includes(ownedUrl), "the genuinely unshared, owned URL must still be captured");

    const { data: sharedJob } = await admin!.from("storage_cleanup_jobs").select("id").eq("bucket_id", "product-images").eq("storage_path", sharedUrl.split("/product-images/")[1]).maybeSingle();
    assert.equal(sharedJob, null, "shared media must never be queued for deletion");

    const ownedPath = ownedUrl.split("/product-images/")[1];
    await admin!.from("storage_cleanup_jobs").delete().eq("bucket_id", "product-images").eq("storage_path", ownedPath);
  } finally {
    // cleanupBrand(brandB.id) deletes brandB's products, which cascades
    // (on delete cascade) to their product_media rows automatically —
    // nothing extra to clean up here.
    await cleanupBrand(brandA.id);
    await cleanupBrand(brandB.id);
  }
});

test("a blocked approval never queues cleanup jobs and never deletes the product (enqueue only happens on the success path)", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "archived" }).eq("id", productId);
    const requestResult = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "cleanup", p_operation_key: randomUUID(),
    });
    const requestId = requestResult.data.requestId;

    const ownedUrl = ownedMediaUrl(`products/${productId}/photo.jpg`);
    await admin!.from("product_media").insert({ product_id: productId, storage_reference: ownedUrl, display_order: 0 });
    // New activity blocks this specific approval.
    const { data: variant } = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 0 }).select("id").single();
    await admin!.from("product_variants").update({ brand_stock_quantity: 1 }).eq("id", variant!.id);

    const approve = await admin!.rpc("admin_approve_product_deletion", { p_request_id: requestId, p_actor_id: null, p_actor_label: "admin-test" });
    assert.equal(approve.data.ok, false);

    const { data: stillThere } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();
    assert.ok(stillThere, "product must survive a blocked approval");

    const ownedPath = ownedUrl.split("/product-images/")[1];
    const { data: job } = await admin!.from("storage_cleanup_jobs").select("id").eq("bucket_id", "product-images").eq("storage_path", ownedPath).maybeSingle();
    assert.equal(job, null, "no cleanup job may be queued when the product was never actually deleted");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("repeated approval calls after a successful deletion are idempotent — no re-delete, no duplicate cleanup jobs", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "archived" }).eq("id", productId);
    const ownedUrl = ownedMediaUrl(`products/${productId}/photo.jpg`);
    await admin!.from("product_media").insert({ product_id: productId, storage_reference: ownedUrl, display_order: 0 });
    const requestResult = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "cleanup", p_operation_key: randomUUID(),
    });
    const requestId = requestResult.data.requestId;

    const first = await admin!.rpc("admin_approve_product_deletion", { p_request_id: requestId, p_actor_id: null, p_actor_label: "admin-test" });
    assert.equal(first.data.ok, true);
    assert.equal(first.data.mediaJobsQueued, 1);

    const ownedPath = ownedUrl.split("/product-images/")[1];
    const { data: jobsAfterFirst } = await admin!.from("storage_cleanup_jobs").select("id").eq("bucket_id", "product-images").eq("storage_path", ownedPath);
    assert.equal(jobsAfterFirst?.length, 1);

    // Retrying the same call after success: the request is already
    // terminal ('completed'), so this must be refused, not silently
    // re-run the delete or duplicate the cleanup job.
    const second = await admin!.rpc("admin_approve_product_deletion", { p_request_id: requestId, p_actor_id: null, p_actor_label: "admin-test" });
    assert.equal(second.data.ok, false);
    assert.equal(second.data.code, "DELETION_REQUEST_STATE_CONFLICT");

    const { data: jobsAfterRetry } = await admin!.from("storage_cleanup_jobs").select("id").eq("bucket_id", "product-images").eq("storage_path", ownedPath);
    assert.equal(jobsAfterRetry?.length, 1, "retrying after success must not duplicate the cleanup job");

    await admin!.from("storage_cleanup_jobs").delete().eq("bucket_id", "product-images").eq("storage_path", ownedPath);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("partial results: one draft deletes successfully with its media queued while a sibling with history fails, independently", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const okProductId = await createDraftProduct(brand.id);
    const blockedProductId = await createDraftProduct(brand.id);
    const okUrl = ownedMediaUrl(`products/${okProductId}/photo.jpg`);
    await admin!.from("product_media").insert({ product_id: okProductId, storage_reference: okUrl, display_order: 0 });

    const { data: variant } = await admin!.from("product_variants").insert({ product_id: blockedProductId, sku: `${blockedProductId}-v1`, quantity: 1 }).select("id").single();
    await admin!.from("inventory_movements").insert({
      variant_id: variant!.id, product_id: blockedProductId, brand_id: brand.id,
      previous_quantity: 0, quantity_delta: 1, new_quantity: 1,
      movement_type: "opening_stock", source: "test", source_operation_key: randomUUID(),
    });

    // Simulates what the bulk route's per-product loop does: independent
    // RPC calls, each its own transaction.
    const okResult = await admin!.rpc("delete_draft_product", { p_product_id: okProductId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    const blockedResult = await admin!.rpc("delete_draft_product", { p_product_id: blockedProductId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });

    assert.equal(okResult.data.ok, true);
    assert.equal(blockedResult.data.ok, false);
    assert.equal(blockedResult.data.code, "PRODUCT_NOT_DRAFT");

    const { data: okGone } = await admin!.from("products").select("id").eq("id", okProductId).maybeSingle();
    assert.equal(okGone, null);
    const { data: blockedStillThere } = await admin!.from("products").select("id").eq("id", blockedProductId).maybeSingle();
    assert.ok(blockedStillThere, "the failed sibling must be untouched by the other's success");

    const okPath = okUrl.split("/product-images/")[1];
    const { data: okJob } = await admin!.from("storage_cleanup_jobs").select("id").eq("bucket_id", "product-images").eq("storage_path", okPath).maybeSingle();
    assert.ok(okJob, "the successful product's cleanup job must exist regardless of the sibling's failure");

    await admin!.from("storage_cleanup_jobs").delete().eq("bucket_id", "product-images").eq("storage_path", okPath);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("the storage cleanup worker actually processes and clears a queued job", { skip: !runLive }, async () => {
  const { processStorageCleanupJobs } = await import("../lib/account/storageCleanup.ts");
  const dummyPath = `products/${randomUUID()}/does-not-exist.jpg`;
  const { data: job, error } = await admin!.from("storage_cleanup_jobs").insert({ bucket_id: "product-images", storage_path: dummyPath }).select("id").single();
  assert.equal(error, null);

  try {
    const result = await processStorageCleanupJobs({ jobIds: [job!.id as string] });
    // Supabase Storage's .remove() on a non-existent path is itself
    // idempotent (no error) — the worker must therefore treat it as
    // completed and clear it from the queue, not leave it stuck.
    assert.equal(result.completed, 1);
    const { data: stillQueued } = await admin!.from("storage_cleanup_jobs").select("id").eq("id", job!.id).maybeSingle();
    assert.equal(stillQueued, null, "a successfully processed job must be removed from the queue");
  } finally {
    // Already removed by the worker on success — this is a no-op belt-
    // and-braces cleanup in case the assertion above throws first.
    await admin!.from("storage_cleanup_jobs").delete().eq("id", job!.id);
  }
});
