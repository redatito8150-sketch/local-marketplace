import test from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { resolveLiveSupabaseTestConfig } from "./helpers/liveSupabaseTestConfig.ts";

// Real, executable behavioral tests for the product-launch-policy /
// opening-stock redesign (supabase/migrations/
// 20260815000000_product_launch_policy_and_opening_stock.sql) — these
// create real rows and call the real RPCs against a live, migrated
// Supabase project, rather than asserting on SQL source text (that static
// coverage lives in tests/productLaunchPolicyMigration.test.ts).
//
// Uses the shared live-test gate: fully skipped unless RUN_LIVE_RLS is set,
// the exact disposable project ref is allowlisted, and credentials are configured,
// and additionally skipped if the credentialed project does NOT yet have
// this branch's migration applied (probed via a cheap read of
// products.launch_policy). The suite is expected to report all-skipped in
// an ordinary local/CI run.
// It exists to run for real once pointed at a staging/local Postgres that
// has run the migration above.

const liveConfig = resolveLiveSupabaseTestConfig();
const supabaseUrl = liveConfig?.supabaseUrl;
const serviceRoleKey = liveConfig?.serviceRoleKey;
const hasCredentials = Boolean(liveConfig && serviceRoleKey);
const integrationTestsEnabled = process.env.RUN_PRODUCT_LAUNCH_POLICY_INTEGRATION === "1";

let admin: SupabaseClient | null = null;
let schemaReady = false;

async function probeSchemaReady(): Promise<boolean> {
  if (!hasCredentials) return false;
  admin = createClient(supabaseUrl!, serviceRoleKey!);
  const { error: columnsError } = await admin.from("products").select("launch_policy, first_visible_at").limit(1);
  if (columnsError) return false;
  // The pause/resume assertions below require the delete-first lifecycle
  // migration too. Probe the new RPC with a guaranteed-missing product so
  // no state can change; an older schema returns a missing-function error.
  const { data, error: lifecycleError } = await admin.rpc("pause_product", {
    p_product_id: `schema-probe-${randomUUID()}`,
    p_brand_id: null,
    p_actor_id: null,
  });
  return !lifecycleError && data?.code === "PRODUCT_NOT_FOUND";
}

schemaReady = await probeSchemaReady();
const runLive = integrationTestsEnabled && hasCredentials && schemaReady;

async function createThrowawayBrand(isPartner = false) {
  const slug = `test-launch-${randomUUID()}`;
  const { data, error } = await admin!
    .from("brands")
    .insert({
      slug, name: slug, category: "Test", story_body: "Launch-policy test brand",
      is_active: true, sku_prefix: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(),
      is_mahaly_partner: isPartner,
      fulfillment_mode: isPartner ? "zakhnook_fulfilled" : "brand_fulfilled",
    })
    .select("id, slug")
    .single();
  if (error) throw new Error(`createThrowawayBrand failed: ${error.message}`);
  return data as { id: string; slug: string };
}

async function createPublishedProduct(brandId: string, launchPolicy: "show_now" | "when_stocked") {
  const id = `test-launch-product-${randomUUID()}`;
  const { data: taxonomy } = await admin!.from("taxonomy_nodes").select("id").limit(1).single();
  const { error } = await admin!.from("products").insert({
    id, name: "Launch Policy Test Product", brand_name: "Test", brand_id: brandId,
    price: 10, currency: "USD", image: "https://example.invalid/x.jpg", sku: id,
    description: "Complete launch-policy integration product.",
    product_type_id: taxonomy?.id, audience: "unisex", status: "published",
    launch_policy: launchPolicy, publish_date: new Date(Date.now() - 60_000).toISOString(),
  });
  if (error) throw new Error(`createPublishedProduct failed: ${error.message}`);
  return id;
}

async function createVariantViaRpc(productId: string, actorId: string | null = null) {
  const { data, error } = await admin!.rpc("create_variant_with_opening_stock", {
    p_product_id: productId, p_sku: `${productId}-v1`, p_combo_key: "default",
    // Deliberately nonzero — proves the server ignores it regardless.
    p_opening_stock: 25,
    p_variant_price: null, p_variant_discount_percent: null,
    p_low_stock_threshold_override: null, p_selling_status: "active",
    p_option_value_ids: [], p_actor_id: actorId, p_operation_key: randomUUID(),
  });
  if (error) throw new Error(`create_variant_with_opening_stock failed: ${error.message}`);
  return data as string;
}

async function cleanupBrand(brandId: string) {
  await admin!.from("products").delete().eq("brand_id", brandId);
  await admin!.from("brands").delete().eq("id", brandId);
}

// ============================================================================
// Part 2/4 — creation never sets stock; the first real Inventory add is the
// opening-stock event.
// ============================================================================

test("a brand-new variant always starts at quantity 0 regardless of a stale client-supplied p_opening_stock, and no inventory_movements row is created at creation time", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const productId = await createPublishedProduct(brand.id, "show_now");
    const variantId = await createVariantViaRpc(productId);

    const { data: variant } = await admin!.from("product_variants").select("quantity").eq("id", variantId).single();
    assert.equal(variant!.quantity, 0, "a stale nonzero p_opening_stock must never be honored");

    const { data: movements } = await admin!.from("inventory_movements").select("id").eq("variant_id", variantId);
    assert.deepEqual(movements, [], "product creation must never create a fake opening_balance movement");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("the first direct positive Inventory addition is recognized once as opening stock, stamps first_stocked_at, and a later restock-from-zero is never re-marked opening stock", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const productId = await createPublishedProduct(brand.id, "when_stocked");
    const variantId = await createVariantViaRpc(productId);

    const first = await admin!.rpc("apply_inventory_adjustments", {
      p_brand_id: brand.id, p_actor_id: null,
      p_adjustments: [{ variant_id: variantId, type: "add", amount: 5 }],
      p_reason: "Opening stock", p_note: null, p_source: "brand_portal", p_operation_key: randomUUID(),
    });
    assert.equal(first.error, null, first.error?.message);
    assert.equal(first.data[0].isOpeningStock, true);

    const { data: productAfterFirst } = await admin!.from("products").select("first_stocked_at, first_visible_at").eq("id", productId).single();
    assert.ok(productAfterFirst!.first_stocked_at, "first_stocked_at must be stamped on first real stock");
    assert.ok(productAfterFirst!.first_visible_at, "a when_stocked product must become visible the moment its stock gate is satisfied");

    // Sell it back down to 0, then restock — must NOT be re-marked opening stock.
    await admin!.rpc("apply_inventory_adjustments", {
      p_brand_id: brand.id, p_actor_id: null,
      p_adjustments: [{ variant_id: variantId, type: "remove", amount: 5 }],
      p_reason: "Sold out", p_note: null, p_source: "brand_portal", p_operation_key: randomUUID(),
    });
    const second = await admin!.rpc("apply_inventory_adjustments", {
      p_brand_id: brand.id, p_actor_id: null,
      p_adjustments: [{ variant_id: variantId, type: "add", amount: 3 }],
      p_reason: "Restock", p_note: null, p_source: "brand_portal", p_operation_key: randomUUID(),
    });
    assert.equal(second.data[0].isOpeningStock, false, "a later restock-from-zero is not a new opening-stock event");

    const { data: openingRows } = await admin!.from("inventory_movements").select("id").eq("variant_id", variantId).eq("is_opening_stock", true);
    assert.equal(openingRows?.length, 1, "at most one is_opening_stock=true row must ever exist per variant");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("concurrent first-stock adjustments for the same variant cannot both claim opening-stock status", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const productId = await createPublishedProduct(brand.id, "when_stocked");
    const variantId = await createVariantViaRpc(productId);

    const [a, b] = await Promise.all([
      admin!.rpc("apply_inventory_adjustments", {
        p_brand_id: brand.id, p_actor_id: null,
        p_adjustments: [{ variant_id: variantId, type: "add", amount: 2 }],
        p_reason: "Race A", p_note: null, p_source: "brand_portal", p_operation_key: randomUUID(),
      }),
      admin!.rpc("apply_inventory_adjustments", {
        p_brand_id: brand.id, p_actor_id: null,
        p_adjustments: [{ variant_id: variantId, type: "add", amount: 3 }],
        p_reason: "Race B", p_note: null, p_source: "brand_portal", p_operation_key: randomUUID(),
      }),
    ]);
    const openingFlags = [a.data?.[0]?.isOpeningStock, b.data?.[0]?.isOpeningStock].filter(Boolean);
    assert.equal(openingFlags.length, 1, "exactly one of the two concurrent adjustments may claim opening-stock status");

    const { data: openingRows } = await admin!.from("inventory_movements").select("id").eq("variant_id", variantId).eq("is_opening_stock", true);
    assert.equal(openingRows?.length, 1);
  } finally {
    await cleanupBrand(brand.id);
  }
});

// ============================================================================
// Part 5/6 — launch policy visibility.
// ============================================================================

test("a show_now product with zero stock is publicly visible via storefront_products but has no purchasable variant", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const productId = await createPublishedProduct(brand.id, "show_now");
    await createVariantViaRpc(productId);

    const { data: row } = await admin!.from("storefront_products").select("id").eq("id", productId).maybeSingle();
    assert.ok(row, "a show_now product must be visible even at 0 stock");

    const { data: variant } = await admin!.from("product_variants").select("quantity").eq("product_id", productId).single();
    assert.equal(variant!.quantity, 0);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("a when_stocked product is absent from storefront_products before stock, and appears automatically the moment stock lands", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const productId = await createPublishedProduct(brand.id, "when_stocked");
    const variantId = await createVariantViaRpc(productId);

    const before = await admin!.from("storefront_products").select("id").eq("id", productId).maybeSingle();
    assert.equal(before.data, null, "a when_stocked product with no stock must never be storefront-visible");

    await admin!.rpc("apply_inventory_adjustments", {
      p_brand_id: brand.id, p_actor_id: null,
      p_adjustments: [{ variant_id: variantId, type: "add", amount: 1 }],
      p_reason: "First stock", p_note: null, p_source: "brand_portal", p_operation_key: randomUUID(),
    });

    const after = await admin!.from("storefront_products").select("id, first_visible_at").eq("id", productId).maybeSingle();
    assert.ok(after.data, "must become visible automatically once stock lands — no second publish needed");
    assert.ok(after.data!.first_visible_at);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("pause blocks visibility even after stock arrives, and resume respects the launch policy + current stock rather than auto-showing", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const productId = await createPublishedProduct(brand.id, "when_stocked");
    const variantId = await createVariantViaRpc(productId);
    await admin!.rpc("apply_inventory_adjustments", {
      p_brand_id: brand.id, p_actor_id: null,
      p_adjustments: [{ variant_id: variantId, type: "add", amount: 1 }],
      p_reason: "First stock", p_note: null, p_source: "brand_portal", p_operation_key: randomUUID(),
    });
    const pause = await admin!.rpc("pause_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null });
    assert.equal(pause.data?.code, "PRODUCT_PAUSED");

    const pausedVisibility = await admin!.rpc("is_product_customer_visible", { p_product_id: productId });
    assert.equal(pausedVisibility.data, false, "pause must block visibility even with stock available");

    const resume = await admin!.rpc("resume_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null });
    assert.equal(resume.data?.code, "PRODUCT_RESUMED");
    const resumedVisibility = await admin!.rpc("is_product_customer_visible", { p_product_id: productId });
    assert.equal(resumedVisibility.data, true, "resume returns to the visibility determined by policy + stock");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("the explicit Show now override moves a when_stocked product to show_now and stamps first_visible_at even with zero stock, and is idempotent", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const productId = await createPublishedProduct(brand.id, "when_stocked");
    await createVariantViaRpc(productId);

    const before = await admin!.from("storefront_products").select("id").eq("id", productId).maybeSingle();
    assert.equal(before.data, null);

    const result = await admin!.rpc("set_product_launch_policy_show_now", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
    });
    assert.equal(result.data.ok, true);
    assert.equal(result.data.code, "LAUNCH_POLICY_UPDATED");

    const after = await admin!.from("storefront_products").select("id, launch_policy, first_visible_at").eq("id", productId).maybeSingle();
    assert.ok(after.data, "must be visible immediately after the override, even at 0 stock");
    assert.equal(after.data!.launch_policy, "show_now");
    assert.ok(after.data!.first_visible_at);

    const replay = await admin!.rpc("set_product_launch_policy_show_now", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
    });
    assert.equal(replay.data.ok, true);
    assert.equal(replay.data.code, "ALREADY_SHOW_NOW");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("a brand cannot Show-now another brand's product", { skip: !runLive }, async () => {
  const brandA = await createThrowawayBrand(false);
  const brandB = await createThrowawayBrand(false);
  try {
    const productId = await createPublishedProduct(brandA.id, "when_stocked");
    const result = await admin!.rpc("set_product_launch_policy_show_now", {
      p_product_id: productId, p_brand_id: brandB.id, p_actor_id: null, p_actor_label: "test",
    });
    assert.equal(result.data.ok, false);
    assert.equal(result.data.code, "PRODUCT_NOT_OWNED");
  } finally {
    await cleanupBrand(brandA.id);
    await cleanupBrand(brandB.id);
  }
});

// ============================================================================
// Part 6 — checkout defense in depth at the DB boundary.
// ============================================================================

test("a service-role order_items insert is rejected for a when_stocked product with no stock yet — the DB trigger enforces the same rule checkout's API layer does", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const productId = await createPublishedProduct(brand.id, "when_stocked");
    const variantId = await createVariantViaRpc(productId);
    // Force some sellable quantity directly for this test's purposes only,
    // to isolate "is the product itself visible" from "is there stock" —
    // the trigger must still reject on the product-level gate alone.
    await admin!.from("product_variants").update({ quantity: 5 }).eq("id", variantId);

    const { data: order } = await admin!.from("orders").insert({
      order_number: `TEST-${randomUUID().slice(0, 8)}`, brand_slug: brand.slug, fulfillment_type: "brand_direct",
      status: "confirmed", payment_status: "unpaid", total: 10, currency: "USD", customer_email: "test@example.invalid",
    }).select("id").single();

    await assert.rejects(
      async () => {
        await admin!.from("order_items").insert({ order_id: order!.id, product_id: productId, variant_id: variantId, quantity: 1, price: 10 }).throwOnError();
      },
      /PRODUCT_NOT_AVAILABLE_FOR_ORDER/
    );

    await admin!.from("orders").delete().eq("id", order!.id);
  } finally {
    await cleanupBrand(brand.id);
  }
});

// ============================================================================
// Part 7 — scheduled visibility activation.
// ============================================================================

test("the scheduled-activation batch RPC stamps first_visible_at once a future publish_date has elapsed, for a show_now product with no other pending action", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const id = `test-launch-product-${randomUUID()}`;
    const { data: taxonomy } = await admin!.from("taxonomy_nodes").select("id").limit(1).single();
    await admin!.from("products").insert({
      id, name: "Scheduled Product", brand_name: "Test", brand_id: brand.id,
      price: 10, currency: "USD", image: "https://example.invalid/x.jpg", sku: id,
      product_type_id: taxonomy?.id, audience: "unisex", status: "published",
      launch_policy: "show_now", publish_date: new Date(Date.now() + 3600_000).toISOString(),
    });

    const before = await admin!.from("storefront_products").select("id").eq("id", id).maybeSingle();
    assert.equal(before.data, null, "must not be visible before its scheduled publish_date");

    // Simulate the scheduled date having elapsed.
    await admin!.from("products").update({ publish_date: new Date(Date.now() - 60_000).toISOString() }).eq("id", id);

    const outcome = await admin!.rpc("execute_scheduled_product_visibility_activation", { p_batch_size: 200 });
    assert.equal(outcome.error, null, outcome.error?.message);
    assert.ok(outcome.data.activated >= 1);

    const after = await admin!.from("storefront_products").select("id, first_visible_at").eq("id", id).maybeSingle();
    assert.ok(after.data);
    assert.ok(after.data!.first_visible_at);
  } finally {
    await cleanupBrand(brand.id);
  }
});
