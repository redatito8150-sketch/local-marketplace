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
// cleans up its own rows in a `finally` block.

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
const integrationTestsEnabled = env.RUN_PRODUCT_DELETION_INTEGRATION === "1";

let admin: SupabaseClient | null = null;
let schemaReady = false;

async function probeSchemaReady(): Promise<boolean> {
  if (!hasCredentials) return false;
  admin = createClient(supabaseUrl!, serviceRoleKey!);
  const { error } = await admin.from("product_deletion_requests").select("id").limit(1);
  return !error;
}

schemaReady = await probeSchemaReady();
const runLive = integrationTestsEnabled && hasCredentials && schemaReady;

async function createThrowawayBrand() {
  const slug = `test-deletion-${randomUUID()}`;
  const { data, error } = await admin!
    .from("brands")
    .insert({
      slug, name: slug, category: "Test", story_body: "Deletion-lifecycle test brand",
      is_active: true, sku_prefix: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(),
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

test("archive is idempotent and reversible; restore requires an active variant", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);

    const first = await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(first.data.ok, true);
    assert.equal(first.data.code, "ARCHIVED");
    const second = await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(second.data.ok, true);
    assert.equal(second.data.code, "ALREADY_ARCHIVED");

    // No active variants yet -> restore should be refused, not silently
    // publish an unsellable product.
    const restoreNoVariant = await admin!.rpc("restore_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(restoreNoVariant.data.ok, false);

    await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 0, selling_status: "active" });
    const restoreOk = await admin!.rpc("restore_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(restoreOk.data.ok, true);
    assert.equal(restoreOk.data.code, "RESTORED");
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

test("deletion request lifecycle: request -> cancel, and duplicate requests are rejected", { skip: !runLive }, async () => {
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

    // Idempotent replay of the exact same key succeeds without duplicating.
    const replay = await admin!.rpc("request_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "no longer selling", p_operation_key: key,
    });
    assert.equal(replay.data.ok, true);
    assert.equal(replay.data.requestId, first.data.requestId);

    // A genuinely new request while one is already open is refused.
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

test("admin approval recomputes eligibility and refuses a request that new activity has blocked", { skip: !runLive }, async () => {
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

    // New activity after the request was filed: a review appears.
    const { data: variant } = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 0 }).select("id").single();
    // A minimal, throwaway review requires an order_item in this schema;
    // skip that heavy fixture and instead simulate the simpler case —
    // brand-held stock appearing after the request was filed.
    await admin!.from("product_variants").update({ brand_stock_quantity: 3 }).eq("id", variant!.id);

    const approve = await admin!.rpc("admin_approve_product_deletion", { p_request_id: requestId, p_actor_id: null, p_actor_label: "admin-test" });
    assert.equal(approve.data.ok, false);
    assert.equal(approve.data.code, "PRODUCT_MUST_BE_RETAINED");

    const { data: stillThere } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();
    assert.ok(stillThere, "product must not have been deleted");

    const { data: requestRow } = await admin!.from("product_deletion_requests").select("status").eq("id", requestId).single();
    assert.equal(requestRow!.status, "blocked");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("an archived product with active variant stock and matching selling_status cannot be ordered (order_items guard trigger)", { skip: !runLive }, async () => {
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
