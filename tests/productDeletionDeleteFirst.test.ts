import test from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { resolveLiveSupabaseTestConfig } from "./helpers/liveSupabaseTestConfig.ts";

// Live integration tests for the delete-first lifecycle (supabase/migrations/
// 20260819120000_paused_status_and_delete_first_lifecycle.sql). Follows the
// exact convention of tests/productDeletionIntegration.test.ts: skipped
// entirely (not failed) unless RUN_PRODUCT_DELETION_INTEGRATION=1 AND the new
// schema is actually present. Per the task's explicit instruction not to
// apply SQL to any database, this migration has NOT been applied to the
// configured project as of this commit — every test below will legitimately
// skip on this machine (schemaReady resolves false, since
// pause_product/resume_product/canDeleteLive don't exist yet) and is
// reported as unverified-until-migrated in the final report, not claimed as
// passing.

const liveConfig = resolveLiveSupabaseTestConfig();
const url = liveConfig?.supabaseUrl;
const key = liveConfig?.serviceRoleKey;
const admin: SupabaseClient | null = url && key ? createClient(url, key) : null;

let schemaReady = false;
if (admin) {
  // pause_product only exists once this migration is applied — a cheap,
  // side-effect-free probe (any product id; PRODUCT_NOT_FOUND still proves
  // the function exists) that mirrors productDeletionIntegration.test.ts's
  // own "select from a table that only exists post-migration" check.
  const { error } = await admin.rpc("pause_product", {
    p_product_id: "schema-probe-nonexistent",
    p_brand_id: null,
    p_actor_id: null,
  });
  schemaReady = !error || !/could not find function|does not exist/i.test(error.message);
}
const runLive = process.env.RUN_PRODUCT_DELETION_INTEGRATION === "1" && Boolean(admin) && schemaReady;

async function createBrand() {
  const slug = `test-dfl-${randomUUID()}`;
  const { data, error } = await admin!
    .from("brands")
    .insert({
      slug,
      name: slug,
      category: "Test",
      story_body: "Delete-first lifecycle integration test",
      is_active: true,
      sku_prefix: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function createPublishedProduct(brandId: string) {
  const id = `test-dfl-product-${randomUUID()}`;
  const { data: taxonomy } = await admin!.from("taxonomy_nodes").select("id").limit(1).single();
  const { error } = await admin!.from("products").insert({
    id,
    name: "Delete-First Integration Product",
    brand_name: "Test",
    brand_id: brandId,
    price: 10,
    currency: "EGP",
    image: "https://example.invalid/product.jpg",
    description: "Complete product used by the delete-first lifecycle integration suite.",
    sku: id,
    product_type_id: taxonomy?.id,
    audience: "unisex",
    status: "published",
    launch_policy: "show_now",
  });
  if (error) throw error;
  const { error: variantError } = await admin!.from("product_variants").insert({
    product_id: id,
    sku: `${id}-DEFAULT`,
    quantity: 0,
    selling_status: "active",
  });
  if (variantError) throw variantError;
  return id;
}

async function cleanup(brandId: string) {
  await admin!.from("order_items").delete().eq("brand_slug", brandId);
  await admin!.from("inventory_movements").delete().eq("brand_id", brandId);
  await admin!.from("product_deletion_history").delete().eq("brand_id", brandId);
  await admin!.from("product_deletion_holds").delete().eq("brand_id", brandId);
  await admin!.from("product_restore_history").delete().eq("brand_id", brandId);
  await admin!.from("products").delete().eq("brand_id", brandId);
  await admin!.from("brands").delete().eq("id", brandId);
}

// ---------------------------------------------------------------------------
// 3. Published -> Pause -> Resume
// ---------------------------------------------------------------------------
test("Published -> Pause -> Resume changes the canonical status both ways and preserves first_visible_at", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createPublishedProduct(brandId);
    await admin!.from("products").update({ first_visible_at: "2026-01-01T00:00:00Z" }).eq("id", productId);

    const paused = await admin!.rpc("pause_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null });
    assert.equal(paused.data.ok, true);
    assert.equal(paused.data.lifecycle, "paused");
    const afterPause = await admin!.from("products").select("status, first_visible_at").eq("id", productId).single();
    assert.equal(afterPause.data?.status, "paused");
    assert.equal(afterPause.data?.first_visible_at, "2026-01-01T00:00:00+00:00");

    const resumed = await admin!.rpc("resume_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null });
    assert.equal(resumed.data.ok, true);
    assert.equal(resumed.data.lifecycle, "published");
    const afterResume = await admin!.from("products").select("status, first_visible_at").eq("id", productId).single();
    assert.equal(afterResume.data?.status, "published");
    assert.equal(afterResume.data?.first_visible_at, "2026-01-01T00:00:00+00:00", "Resume must not move first_visible_at");
  } finally {
    await cleanup(brandId);
  }
});

test("pause_product is idempotent and refuses a Draft/Archived product", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createPublishedProduct(brandId);
    const first = await admin!.rpc("pause_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null });
    assert.equal(first.data.code, "PRODUCT_PAUSED");
    const replay = await admin!.rpc("pause_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null });
    assert.equal(replay.data.code, "ALREADY_PAUSED");

    const draftId = `test-dfl-draft-${randomUUID()}`;
    await admin!.from("products").insert({
      id: draftId, name: "Draft", brand_name: "Test", brand_id: brandId, price: 10, currency: "EGP",
      image: "https://example.invalid/x.jpg", sku: draftId, status: "draft",
    });
    const draftPause = await admin!.rpc("pause_product", { p_product_id: draftId, p_brand_id: brandId, p_actor_id: null });
    assert.equal(draftPause.data.ok, false);
    assert.equal(draftPause.data.code, "PRODUCT_NOT_PUBLISHED");
  } finally {
    await cleanup(brandId);
  }
});

// ---------------------------------------------------------------------------
// 4 & 5. Published/Paused -> deletion preflight -> safe permanent deletion
// ---------------------------------------------------------------------------
test("a history-free Published product is directly permanently deletable, and the same holds once Paused", { skip: !runLive }, async () => {
  for (const pauseFirst of [false, true]) {
    const brandId = await createBrand();
    try {
      const productId = await createPublishedProduct(brandId);
      if (pauseFirst) await admin!.rpc("pause_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null });

      const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
      assert.equal(eligibility.data.canDeleteLive, true, `canDeleteLive should be true (pauseFirst=${pauseFirst})`);
      assert.equal(eligibility.data.mustRetainHistory, false);

      const operationKey = randomUUID();
      const deleted = await admin!.rpc("delete_live_product", {
        p_product_id: productId, p_brand_id: brandId, p_actor_id: null,
        p_actor_label: "integration-test", p_reason: "test", p_operation_key: operationKey,
      });
      assert.equal(deleted.data.ok, true);

      const replay = await admin!.rpc("delete_live_product", {
        p_product_id: productId, p_brand_id: brandId, p_actor_id: null,
        p_actor_label: "integration-test", p_reason: "test", p_operation_key: operationKey,
      });
      assert.equal(replay.data.code, "ALREADY_DELETED", "retry with the same operation key must not double-delete or error");

      const history = await admin!.from("product_deletion_history").select("deleted_from").eq("product_id_snapshot", productId).single();
      assert.equal(history.data?.deleted_from, pauseFirst ? "paused" : "published");
    } finally {
      await cleanup(brandId);
    }
  }
});

// ---------------------------------------------------------------------------
// 6, 7, 8, 9. Categorized immutable history blocks hard deletion
// ---------------------------------------------------------------------------
test("a fulfilled order is reported as a completed sale and blocks permanent deletion; Archive is required instead", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createPublishedProduct(brandId);
    const order = await admin!
      .from("orders")
      .insert({
        order_number: `TEST-${randomUUID().slice(0, 8)}`, user_id: null, status: "fulfilled",
        shipping_name: "T", shipping_email: "t@example.invalid", shipping_phone: "0100",
        shipping_address: "x", shipping_city: "Cairo", shipping_governorate: "Cairo",
        subtotal_egp: 10, brand_slug: brandId, fulfillment_type: "brand_direct",
      })
      .select("id")
      .single();
    if (order.error) throw order.error;
    await admin!.from("order_items").insert({
      order_id: order.data.id, product_id: productId, name: "x", brand: "x", price: 10,
      currency: "EGP", size: "M", image: "https://example.invalid/x.jpg", quantity: 1,
    });

    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.canDeleteLive, false);
    assert.equal(eligibility.data.mustRetainHistory, true);
    assert.equal(eligibility.data.canArchive, true);
    const salesBlocker = eligibility.data.immutableReasons.find((b: { code: string }) => b.code === "PRODUCT_HAS_COMPLETED_SALES");
    assert.ok(salesBlocker, "expected a PRODUCT_HAS_COMPLETED_SALES blocker, not an undifferentiated order-history blocker");
    assert.equal(salesBlocker.count, 1);
    assert.doesNotMatch(salesBlocker.message.toLowerCase(), /cancelled|open/);

    const archived = await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null, p_actor_label: "test" });
    assert.equal(archived.data.ok, true);
    await admin!.from("order_items").delete().eq("order_id", order.data.id);
    await admin!.from("orders").delete().eq("id", order.data.id);
  } finally {
    await cleanup(brandId);
  }
});

test("inventory movement history blocks permanent deletion of a live product exactly as it does for Archived", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createPublishedProduct(brandId);
    const variant = await admin!
      .from("product_variants")
      .insert({ product_id: productId, sku: `${productId}-V`, quantity: 0 })
      .select("id")
      .single();
    await admin!.from("inventory_movements").insert({
      variant_id: variant.data!.id, product_id: productId, brand_id: brandId,
      previous_quantity: 0, quantity_delta: 0, new_quantity: 0,
      movement_type: "correction", source: "test", source_operation_key: randomUUID(),
    });
    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.canDeleteLive, false);
    assert.ok(eligibility.data.immutableReasons.some((b: { code: string }) => b.code === "PRODUCT_HAS_INVENTORY_HISTORY"));
  } finally {
    await cleanup(brandId);
  }
});

test("received/rejected/cancelled warehouse documents are immutable history, not a temporary blocker", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  let transferId: string | undefined;
  try {
    const productId = await createPublishedProduct(brandId);
    const variant = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-V`, quantity: 0 }).select("id").single();
    const transfer = await admin!.from("warehouse_transfers").insert({ brand_id: brandId, status: "received", direction: "brand_to_warehouse" }).select("id").single();
    transferId = transfer.data!.id;
    await admin!.from("warehouse_transfer_items").insert({ transfer_id: transferId, variant_id: variant.data!.id, requested_qty: 1, received_ok_qty: 1 });

    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.canDeleteLive, false);
    assert.ok(eligibility.data.immutableReasons.some((b: { code: string }) => b.code === "PRODUCT_HAS_WAREHOUSE_HISTORY"));
  } finally {
    // warehouse_transfer_items.variant_id is ON DELETE RESTRICT — must be
    // cleared before cleanup() cascade-deletes product_variants via products.
    if (transferId) {
      await admin!.from("warehouse_transfer_items").delete().eq("transfer_id", transferId);
      await admin!.from("warehouse_transfers").delete().eq("id", transferId);
    }
    await cleanup(brandId);
  }
});

test("a customer review blocks permanent deletion of a live product", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  let productId: string | undefined;
  try {
    productId = await createPublishedProduct(brandId);
    await admin!.from("reviews").insert({ product_id: productId, rating: 5, title: "t", body: "b", status: "published" });
    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.canDeleteLive, false);
    assert.ok(eligibility.data.immutableReasons.some((b: { code: string }) => b.code === "PRODUCT_HAS_REVIEWS"));
  } finally {
    // reviews.product_id is ON DELETE RESTRICT — cleanup()'s products
    // delete would otherwise fail while this row still references it.
    if (productId) await admin!.from("reviews").delete().eq("product_id", productId);
    await cleanup(brandId);
  }
});

test("a refunded payment is reported distinctly from an ordinary completed sale", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createPublishedProduct(brandId);
    const masterOrderId = randomUUID();
    const order = await admin!
      .from("orders")
      .insert({
        order_number: `TEST-${randomUUID().slice(0, 8)}`, user_id: null, status: "fulfilled",
        shipping_name: "T", shipping_email: "t@example.invalid", shipping_phone: "0100",
        shipping_address: "x", shipping_city: "Cairo", shipping_governorate: "Cairo",
        subtotal_egp: 10, brand_slug: brandId, fulfillment_type: "brand_direct", master_order_id: masterOrderId,
      })
      .select("id")
      .single();
    if (order.error) throw order.error;
    await admin!.from("order_items").insert({
      order_id: order.data.id, product_id: productId, name: "x", brand: "x", price: 10,
      currency: "EGP", size: "M", image: "https://example.invalid/x.jpg", quantity: 1,
    });
    const attempt = await admin!
      .from("payment_attempts")
      .insert({
        user_id: (await admin!.auth.admin.createUser({ email: `zz-dfl-${randomUUID()}@example.invalid`, password: "Test!123456aA1", email_confirm: true })).data.user!.id,
        provider: "paymob", special_reference: randomUUID(), idempotency_actor: `user:${randomUUID()}`,
        client_request_id: randomUUID(), request_hash: "0".repeat(64), amount_cents: 1000,
        status: "paid", cart_snapshot: [], shipping_snapshot: {}, master_order_id: masterOrderId,
        refunded_at: new Date().toISOString(),
      })
      .select("id, user_id")
      .single();
    if (attempt.error) throw attempt.error;

    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    const refundBlocker = eligibility.data.immutableReasons.find((b: { code: string }) => b.code === "PRODUCT_HAS_REFUNDS");
    assert.ok(refundBlocker, "expected a distinct PRODUCT_HAS_REFUNDS blocker");
    const salesBlocker = eligibility.data.immutableReasons.find((b: { code: string }) => b.code === "PRODUCT_HAS_COMPLETED_SALES");
    assert.ok(salesBlocker, "the same order is also a completed sale — both must be reported, not merged into one");

    await admin!.from("payment_attempts").delete().eq("id", attempt.data.id);
    await admin!.auth.admin.deleteUser(attempt.data.user_id);
    await admin!.from("order_items").delete().eq("order_id", order.data.id);
    await admin!.from("orders").delete().eq("id", order.data.id);
  } finally {
    await cleanup(brandId);
  }
});

// ---------------------------------------------------------------------------
// 10, 11, 12. Evidence counts, temporary-blocker recheck, combined case
// ---------------------------------------------------------------------------
test("temporary stock blocker reports the exact quantity and clears on recheck without any Archive offer", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createPublishedProduct(brandId);
    await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-V`, quantity: 7 });

    const blocked = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(blocked.data.canDeleteLive, false);
    assert.equal(blocked.data.mustRetainHistory, false);
    assert.equal(blocked.data.canArchive, false, "a purely temporary blocker must never itself unlock Archive");
    const stockBlocker = blocked.data.temporaryBlockers.find((b: { code: string }) => b.code === "PRODUCT_HAS_AVAILABLE_STOCK");
    assert.equal(stockBlocker.quantity, 7);

    await admin!.from("product_variants").update({ quantity: 0 }).eq("product_id", productId);
    const clear = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(clear.data.canDeleteLive, true);
  } finally {
    await cleanup(brandId);
  }
});

test("immutable history and a temporary blocker are both reported, but Archive waits until the temporary blocker is resolved", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  let productId: string | undefined;
  try {
    productId = await createPublishedProduct(brandId);
    await admin!.from("reviews").insert({ product_id: productId, rating: 5, title: "t", body: "b", status: "published" });
    await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-V`, quantity: 3 });

    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.mustRetainHistory, true);
    assert.equal(eligibility.data.hasTemporaryBlockers, true);
    assert.equal(eligibility.data.canArchive, false);
    assert.equal(eligibility.data.immutableReasons.length > 0, true);
    assert.equal(eligibility.data.temporaryBlockers.length > 0, true);

    const blockedArchive = await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null, p_actor_label: "test" });
    assert.equal(blockedArchive.data.code, "PRODUCT_ARCHIVE_BLOCKED");

    await admin!.from("product_variants").update({ quantity: 0 }).eq("product_id", productId);
    const resolved = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(resolved.data.canArchive, true);
  } finally {
    if (productId) await admin!.from("reviews").delete().eq("product_id", productId);
    await cleanup(brandId);
  }
});

// ---------------------------------------------------------------------------
// 13. Archive fallback requires explicit confirmation / self-guards
// ---------------------------------------------------------------------------
test("archive_product refuses to archive a history-free product — Archive is never an ordinary hide action", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  try {
    const productId = await createPublishedProduct(brandId);
    const result = await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null, p_actor_label: "test" });
    assert.equal(result.data.ok, false);
    assert.equal(result.data.code, "ARCHIVE_NOT_REQUIRED");
    const row = await admin!.from("products").select("status").eq("id", productId).single();
    assert.equal(row.data?.status, "published");
  } finally {
    await cleanup(brandId);
  }
});

// ---------------------------------------------------------------------------
// 18, 19. Admin-only restore lands on Paused, requires a reason, is idempotent
// ---------------------------------------------------------------------------
test("admin_restore_archived_product requires a reason, is idempotent, and lands on Paused (never Published)", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  let productId: string | undefined;
  try {
    productId = await createPublishedProduct(brandId);
    await admin!.from("reviews").insert({ product_id: productId, rating: 5, title: "t", body: "b", status: "published" });
    await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null, p_actor_label: "test" });

    const noReason = await admin!.rpc("admin_restore_archived_product", {
      p_product_id: productId, p_actor_id: null, p_actor_label: "test", p_reason: "", p_operation_key: randomUUID(),
    });
    assert.equal(noReason.data.ok, false);
    assert.equal(noReason.data.code, "REASON_REQUIRED");

    const operationKey = randomUUID();
    const restored = await admin!.rpc("admin_restore_archived_product", {
      p_product_id: productId, p_actor_id: null, p_actor_label: "test", p_reason: "false positive hold", p_operation_key: operationKey,
    });
    assert.equal(restored.data.ok, true);
    const row = await admin!.from("products").select("status").eq("id", productId).single();
    assert.equal(row.data?.status, "paused", "restore must land on Paused, never Published");

    const replay = await admin!.rpc("admin_restore_archived_product", {
      p_product_id: productId, p_actor_id: null, p_actor_label: "test", p_reason: "false positive hold", p_operation_key: operationKey,
    });
    assert.equal(replay.data.code, "ALREADY_RESTORED");
  } finally {
    if (productId) await admin!.from("reviews").delete().eq("product_id", productId);
    await cleanup(brandId);
  }
});

test("an active hold blocks admin restore, and releasing it makes restore possible again", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  let productId: string | undefined;
  try {
    productId = await createPublishedProduct(brandId);
    await admin!.from("reviews").insert({ product_id: productId, rating: 5, title: "t", body: "b", status: "published" });
    await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null, p_actor_label: "test" });
    await admin!.rpc("apply_product_deletion_hold", { p_product_id: productId, p_actor_id: null, p_actor_label: "test", p_reason: "legal review" });

    const blocked = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(blocked.data.canRestore, false);
    const restoreAttempt = await admin!.rpc("admin_restore_archived_product", {
      p_product_id: productId, p_actor_id: null, p_actor_label: "test", p_reason: "test", p_operation_key: randomUUID(),
    });
    assert.equal(restoreAttempt.data.ok, false);
    assert.equal(restoreAttempt.data.code, "PRODUCT_HAS_ACTIVE_HOLD");

    await admin!.rpc("release_product_deletion_hold", { p_product_id: productId, p_actor_id: null, p_actor_label: "test" });
    const released = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(released.data.canRestore, true);
  } finally {
    if (productId) await admin!.from("reviews").delete().eq("product_id", productId);
    await cleanup(brandId);
  }
});

test("an incomplete Archived product can be restored to hidden Paused for repair, but cannot Resume until complete", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  let productId: string | undefined;
  try {
    productId = await createPublishedProduct(brandId);
    await admin!.from("reviews").insert({ product_id: productId, rating: 5, title: "t", body: "b", status: "published" });
    const archived = await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null, p_actor_label: "test" });
    assert.equal(archived.data.code, "PRODUCT_ARCHIVED");

    await admin!.from("products").update({ image: "", description: "" }).eq("id", productId);
    const restored = await admin!.rpc("admin_restore_archived_product", {
      p_product_id: productId,
      p_actor_id: null,
      p_actor_label: "test",
      p_reason: "repair catalog content",
      p_operation_key: randomUUID(),
    });
    assert.equal(restored.data.code, "PRODUCT_RESTORED");

    const blockedResume = await admin!.rpc("resume_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null });
    assert.equal(blockedResume.data.code, "PRODUCT_INCOMPLETE");
    const row = await admin!.from("products").select("status").eq("id", productId).single();
    assert.equal(row.data?.status, "paused");
  } finally {
    if (productId) await admin!.from("reviews").delete().eq("product_id", productId);
    await cleanup(brandId);
  }
});

// ---------------------------------------------------------------------------
// 20. Generic PATCH / archived-transition trigger cannot be bypassed
// ---------------------------------------------------------------------------
test("a raw update out of Archived is rejected by the trigger even for the service role, and Paused cannot revert to Draft", { skip: !runLive }, async () => {
  const brandId = await createBrand();
  let productId: string | undefined;
  try {
    productId = await createPublishedProduct(brandId);
    await admin!.rpc("pause_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null });
    const pausedToDraft = await admin!.from("products").update({ status: "draft" }).eq("id", productId);
    assert.ok(pausedToDraft.error);
    assert.match(pausedToDraft.error!.message, /PRODUCT_PUBLISHED_CANNOT_REVERT_TO_DRAFT/);

    await admin!.rpc("resume_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null });
    await admin!.from("reviews").insert({ product_id: productId, rating: 5, title: "t", body: "b", status: "published" });
    await admin!.rpc("archive_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null, p_actor_label: "test" });
    const archivedToPaused = await admin!.from("products").update({ status: "paused" }).eq("id", productId);
    assert.ok(archivedToPaused.error);
    assert.match(archivedToPaused.error!.message, /PRODUCT_ARCHIVED_IS_TERMINAL/);
  } finally {
    if (productId) await admin!.from("reviews").delete().eq("product_id", productId);
    await cleanup(brandId);
  }
});

// ---------------------------------------------------------------------------
// 24. RLS / service-role-only access
// ---------------------------------------------------------------------------
test("every new lifecycle RPC rejects the anon key", { skip: !runLive || !liveConfig?.anonKey }, async () => {
  const anon = createClient(url!, liveConfig!.anonKey);
  for (const [fn, args] of [
    ["pause_product", { p_product_id: "x", p_brand_id: null, p_actor_id: null }],
    ["resume_product", { p_product_id: "x", p_brand_id: null, p_actor_id: null }],
    ["delete_live_product", { p_product_id: "x", p_brand_id: null, p_actor_id: null, p_actor_label: "x", p_reason: "x", p_operation_key: randomUUID() }],
    ["admin_restore_archived_product", { p_product_id: "x", p_actor_id: null, p_actor_label: "x", p_reason: "x", p_operation_key: randomUUID() }],
  ] as const) {
    const { error } = await anon.rpc(fn, args);
    assert.ok(error, `${fn} must reject the anon key`);
    assert.match(error!.message, /permission denied|not authorized/i);
  }
});
