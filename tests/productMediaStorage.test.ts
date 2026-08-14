import test from "node:test";
import assert from "node:assert/strict";
import { extractOwnedStorageTargets } from "../lib/admin/productMediaStorage.ts";

// Pure, no-DB-needed coverage for the storage-orphan-prevention logic
// (item 8 of the corrective pass): delete_draft_product/
// admin_approve_product_deletion return every media URL the deleted
// product ever had; this function is what decides which of those URLs
// actually get queued for Storage cleanup (lib/account/storageCleanup.ts)
// — item 13's "storage cleanup is queued" regression coverage.

const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example-project.supabase.co";
const BASE = "https://example-project.supabase.co/storage/v1/object/public/product-images/";

test.after(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
});

test("extracts the storage path for a URL genuinely owned by this product's folder", () => {
  const targets = extractOwnedStorageTargets("prod-123", [`${BASE}products/prod-123/1234-photo.jpg`]);
  assert.deepEqual(targets, [{ bucket_id: "product-images", storage_path: "products/prod-123/1234-photo.jpg" }]);
});

test("never queues a URL belonging to a different product's folder", () => {
  const targets = extractOwnedStorageTargets("prod-123", [`${BASE}products/prod-456/1234-photo.jpg`]);
  assert.deepEqual(targets, []);
});

test("never queues an arbitrary external URL", () => {
  const targets = extractOwnedStorageTargets("prod-123", ["https://images.example.com/random-photo.jpg"]);
  assert.deepEqual(targets, []);
});

test("never queues a URL from a different Supabase Storage bucket", () => {
  const targets = extractOwnedStorageTargets("prod-123", [
    "https://example-project.supabase.co/storage/v1/object/public/review-images/prod-123/photo.jpg",
  ]);
  assert.deepEqual(targets, []);
});

test("rejects path traversal attempts even if they otherwise match the owned prefix", () => {
  const targets = extractOwnedStorageTargets("prod-123", [`${BASE}products/prod-123/../prod-456/photo.jpg`]);
  assert.deepEqual(targets, []);
});

test("de-duplicates repeated URLs and ignores null/undefined/empty entries", () => {
  const url = `${BASE}products/prod-123/photo.jpg`;
  const targets = extractOwnedStorageTargets("prod-123", [url, url, null, undefined, ""]);
  assert.deepEqual(targets, [{ bucket_id: "product-images", storage_path: "products/prod-123/photo.jpg" }]);
});

test("handles a realistic mixed batch: owned media, a color image, and an unrelated external URL", () => {
  const targets = extractOwnedStorageTargets("prod-123", [
    `${BASE}products/prod-123/cover.jpg`,
    `${BASE}products/prod-123/color-red.jpg`,
    "https://cdn.example.com/stock-photo.jpg",
  ]);
  assert.deepEqual(targets, [
    { bucket_id: "product-images", storage_path: "products/prod-123/cover.jpg" },
    { bucket_id: "product-images", storage_path: "products/prod-123/color-red.jpg" },
  ]);
});
