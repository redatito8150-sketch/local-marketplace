import test from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const envPath = path.join(rootDir, ".env.local");
function loadEnv() {
  if (!existsSync(envPath)) return {} as Record<string, string>;
  return Object.fromEntries(readFileSync(envPath, "utf8").split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
}

const env = loadEnv();
const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
let admin: SupabaseClient | null = url && key ? createClient(url, key) : null;
let schemaReady = false;
if (admin) {
  const { error } = await admin.from("product_deletion_history").select("id").limit(1);
  schemaReady = !error;
}
const runLive = env.RUN_PRODUCT_DELETION_INTEGRATION === "1" && Boolean(admin) && schemaReady;

async function createBrand() {
  const slug = `test-archive-${randomUUID()}`;
  const { data, error } = await admin!.from("brands").insert({
    slug, name: slug, category: "Test", story_body: "Archive lifecycle integration test",
    is_active: true, sku_prefix: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(),
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function createDraft(brandId: string) {
  const id = `test-archive-product-${randomUUID()}`;
  const { data: taxonomy } = await admin!.from("taxonomy_nodes").select("id").limit(1).single();
  const { error } = await admin!.from("products").insert({
    id, name: "Archive Integration Product", brand_name: "Test", brand_id: brandId,
    price: 10, currency: "EGP", image: "https://example.invalid/product.jpg",
    sku: id, product_type_id: taxonomy?.id, audience: "unisex", status: "draft",
  });
  if (error) throw error;
  return id;
}

async function archive(productId: string, brandId: string) {
  const { data, error } = await admin!.rpc("archive_product", {
    p_product_id: productId, p_brand_id: brandId, p_actor_id: null, p_actor_label: "integration-test",
  });
  if (error || !data?.ok) throw error ?? new Error(JSON.stringify(data));
}

async function cleanup(brandId: string) {
  await admin!.from("inventory_movements").delete().eq("brand_id", brandId);
  await admin!.from("product_deletion_history").delete().eq("brand_id", brandId);
  await admin!.from("product_deletion_holds").delete().eq("brand_id", brandId);
  await admin!.from("products").delete().eq("brand_id", brandId);
  await admin!.from("brands").delete().eq("id", brandId);
}

test("pristine Draft is deleted immediately with durable history and idempotent replay", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createDraft(brandId);
    const operationKey = randomUUID();
    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.canDeleteDraft, true);
    const first = await admin!.rpc("delete_draft_product", {
      p_product_id: productId, p_brand_id: brandId, p_actor_id: null,
      p_actor_label: "integration-test", p_reason: "test", p_operation_key: operationKey,
    });
    assert.equal(first.data.ok, true);
    assert.equal(first.data.code, "DRAFT_DELETED");
    const replay = await admin!.rpc("delete_draft_product", {
      p_product_id: productId, p_brand_id: brandId, p_actor_id: null,
      p_actor_label: "integration-test", p_reason: "test", p_operation_key: operationKey,
    });
    assert.equal(replay.data.code, "ALREADY_DELETED");
    const history = await admin!.from("product_deletion_history").select("deleted_from").eq("product_id_snapshot", productId).single();
    assert.equal(history.data?.deleted_from, "draft");
  } finally { await cleanup(brandId); }
});

test("Published can Archive directly and Archived cannot be restored by raw update", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createDraft(brandId);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);
    await archive(productId, brandId);
    const row = await admin!.from("products").select("status, archived_at").eq("id", productId).single();
    assert.equal(row.data?.status, "archived");
    assert.ok(row.data?.archived_at);
    const restore = await admin!.from("products").update({ status: "draft" }).eq("id", productId);
    assert.ok(restore.error);
    assert.match(restore.error!.message, /PRODUCT_ARCHIVED_IS_TERMINAL/);
  } finally { await cleanup(brandId); }
});

test("Archived stock is a detailed temporary blocker; clearing it makes immediate deletion eligible", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createDraft(brandId);
    await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-V`, quantity: 4 });
    await archive(productId, brandId);
    const blocked = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(blocked.data.hasTemporaryBlockers, true);
    const stockBlocker = blocked.data.temporaryBlockers.find((item: { code: string }) => item.code === "PRODUCT_HAS_AVAILABLE_STOCK");
    assert.equal(stockBlocker.quantity, 4);
    assert.ok(stockBlocker.resolution);
    await admin!.from("product_variants").update({ quantity: 0 }).eq("product_id", productId);
    const clear = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(clear.data.canDeleteArchived, true);
  } finally { await cleanup(brandId); }
});

test("immutable inventory history keeps the product Archived permanently", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createDraft(brandId);
    const variant = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-V`, quantity: 0 }).select("id").single();
    await admin!.from("inventory_movements").insert({
      variant_id: variant.data!.id, product_id: productId, brand_id: brandId,
      previous_quantity: 0, quantity_delta: 0, new_quantity: 0,
      movement_type: "correction", source: "test", source_operation_key: randomUUID(),
    });
    await archive(productId, brandId);
    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.mustRetainHistory, true);
    assert.equal(eligibility.data.canDeleteArchived, false);
    const attempt = await admin!.rpc("delete_archived_product", {
      p_product_id: productId, p_brand_id: brandId, p_actor_id: null,
      p_actor_label: "integration-test", p_reason: "test", p_operation_key: randomUUID(),
    });
    assert.equal(attempt.data.code, "PRODUCT_MUST_REMAIN_ARCHIVED");
  } finally { await cleanup(brandId); }
});

test("an active admin hold is temporary and release restores the prior eligibility", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createDraft(brandId);
    await archive(productId, brandId);
    await admin!.rpc("apply_product_deletion_hold", { p_product_id: productId, p_actor_id: null, p_actor_label: "test", p_reason: "legal review" });
    const held = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(held.data.hasActiveHold, true);
    assert.equal(held.data.canDeleteArchived, false);
    await admin!.rpc("release_product_deletion_hold", { p_product_id: productId, p_actor_id: null, p_actor_label: "test" });
    const released = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(released.data.canDeleteArchived, true);
  } finally { await cleanup(brandId); }
});

test("registered media path is queued transactionally when an eligible Archived product is deleted", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createDraft(brandId);
    const storagePath = `products/${productId}/test.webp`;
    await admin!.from("product_storage_assets").insert({ product_id: productId, storage_path: storagePath, public_url: `https://example.invalid/${storagePath}`, upload_folder_id: productId, claimed_at: new Date().toISOString() });
    await archive(productId, brandId);
    const deleted = await admin!.rpc("delete_archived_product", {
      p_product_id: productId, p_brand_id: brandId, p_actor_id: null,
      p_actor_label: "integration-test", p_reason: "test", p_operation_key: randomUUID(),
    });
    assert.equal(deleted.data.ok, true);
    const job = await admin!.from("storage_cleanup_jobs").select("storage_path").eq("storage_path", storagePath).maybeSingle();
    assert.equal(job.data?.storage_path, storagePath);
    await admin!.from("storage_cleanup_jobs").delete().eq("storage_path", storagePath);
    await admin!.from("product_storage_assets").delete().eq("storage_path", storagePath);
  } finally { await cleanup(brandId); }
});
