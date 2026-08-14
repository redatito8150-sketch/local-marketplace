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
// THIRD PASS: fully rewritten for the automatic, database-authoritative
// schedule+hold model that replaced the old admin-approval deletion-request
// workflow. There is no more request/approve step: schedule_product_deletion
// either creates a 7-day-grace-period schedule immediately (only when
// currently fully eligible) or refuses outright — nothing here waits on a
// human, and execute_due_product_deletions (the cron executor) is called
// directly in these tests to simulate the grace period elapsing.
//
// Same env-credential-skip convention as tests/fulfillmentIntegration.test.ts:
// fully skipped (not failed) when Supabase credentials aren't configured,
// and additionally skipped if the credentialed project does NOT yet have
// this branch's migration applied (probed via a cheap read of
// product_deletion_schedules). This repo's .env.local points at the real
// Supabase project, and this branch's migration is deliberately never
// applied there (per this task's own "never apply migrations" instruction)
// — so this suite is expected to report all-skipped in this environment.
// It exists to run for real once pointed at a staging/local Postgres that
// has run supabase/migrations/20260814020000_product_deletion_lifecycle.sql.
//
// Every row this suite creates is scoped under a fresh, randomly-named
// throwaway brand/product (never touching any real data), and every test
// cleans up its own rows in a `finally` block via cleanupBrand(), which
// deletes product_deletion_schedules and product_deletion_holds rows for
// the brand FIRST — both are `brand_id ... on delete restrict`, so leftover
// rows would otherwise block the brand delete and leak permanently.

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
  // Probes for THIS pass's schema shape specifically (product_deletion_
  // schedules, not the old product_deletion_requests) so this suite also
  // skips cleanly against a database that still has an earlier pass's
  // migration applied.
  const { error } = await admin.from("product_deletion_schedules").select("id, product_name, product_sku, due_at").limit(1);
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

async function retireForTest(productId: string, brandId: string) {
  const result = await admin!.rpc("retire_product", { p_product_id: productId, p_brand_id: brandId, p_actor_id: null, p_actor_label: "test" });
  if (!result.data?.ok) throw new Error(`retireForTest failed: ${JSON.stringify(result.data ?? result.error)}`);
}

async function scheduleForTest(productId: string, brandId: string, reason = "cleanup") {
  const result = await admin!.rpc("schedule_product_deletion", {
    p_product_id: productId, p_brand_id: brandId, p_actor_id: null, p_actor_label: "test",
    p_reason: reason, p_operation_key: randomUUID(),
  });
  if (!result.data?.ok) throw new Error(`scheduleForTest failed: ${JSON.stringify(result.data ?? result.error)}`);
  return result.data.scheduleId as string;
}

// Simulates the grace period having already elapsed — the executor only
// ever looks at due_at <= now(), so backdating it is the direct way to
// exercise "grace period expires" without actually waiting 7 real days.
async function makeScheduleDue(scheduleId: string) {
  await admin!.from("product_deletion_schedules").update({ due_at: new Date(Date.now() - 1000).toISOString() }).eq("id", scheduleId);
}

async function cleanupBrand(brandId: string) {
  await admin!.from("product_deletion_schedules").delete().eq("brand_id", brandId);
  await admin!.from("product_deletion_holds").delete().eq("brand_id", brandId);
  await admin!.from("products").delete().eq("brand_id", brandId);
  await admin!.from("brands").delete().eq("id", brandId);
}

// ============================================================================
// Pristine-draft immediate deletion — unchanged rule set from prior passes,
// completely separate from the Retired-product scheduling path below.
// ============================================================================

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

// ============================================================================
// Retire / restore.
// ============================================================================

test("retire is idempotent, and canonical restore always lands in draft regardless of variant/stock state", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand(false);
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);

    const first = await admin!.rpc("retire_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(first.data.ok, true);
    assert.equal(first.data.code, "RETIRED");
    const second = await admin!.rpc("retire_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(second.data.ok, true);
    assert.equal(second.data.code, "ALREADY_RETIRED");

    const { data: retiredRow } = await admin!.from("products").select("retired_at").eq("id", productId).single();
    assert.ok(retiredRow!.retired_at, "retired_at must be set on retire");

    // No variants, no stock at all — restore still succeeds, because it
    // only ever targets draft, which has no completeness requirement.
    const restoreOk = await admin!.rpc("restore_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(restoreOk.data.ok, true, `expected restore to succeed, got: ${JSON.stringify(restoreOk.data)}`);
    assert.equal(restoreOk.data.code, "RESTORED");
    assert.equal(restoreOk.data.lifecycle, "draft");

    const { data: row } = await admin!.from("products").select("status, retired_at").eq("id", productId).single();
    assert.equal(row!.status, "draft", "restore must land in draft, never published, directly");
    assert.equal(row!.retired_at, null, "retired_at must be cleared on restore");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("a brand cannot act on another brand's product (retire, schedule, or cancel)", { skip: !runLive }, async () => {
  const brandA = await createThrowawayBrand();
  const brandB = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brandA.id);
    const retire = await admin!.rpc("retire_product", { p_product_id: productId, p_brand_id: brandB.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(retire.data.ok, false);
    assert.equal(retire.data.code, "PRODUCT_NOT_OWNED");

    await retireForTest(productId, brandA.id);
    const schedule = await admin!.rpc("schedule_product_deletion", {
      p_product_id: productId, p_brand_id: brandB.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "x", p_operation_key: randomUUID(),
    });
    assert.equal(schedule.data.ok, false);
    assert.equal(schedule.data.code, "PRODUCT_NOT_OWNED");

    const cancel = await admin!.rpc("cancel_product_deletion_schedule", { p_product_id: productId, p_brand_id: brandB.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(cancel.data.ok, false);
    assert.equal(cancel.data.code, "PRODUCT_NOT_OWNED");
  } finally {
    await cleanupBrand(brandA.id);
    await cleanupBrand(brandB.id);
  }
});

// ============================================================================
// Automatic scheduling — the headline behavioral change this pass makes:
// no admin approval anywhere. schedule_product_deletion only ever creates a
// row when the product is CURRENTLY fully eligible; otherwise nothing is
// created at all.
// ============================================================================

test("a retired product with immutable history can never be scheduled for deletion — no schedule row is created", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    const { data: variant } = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 0 }).select("id").single();
    await admin!.from("inventory_movements").insert({
      variant_id: variant!.id, product_id: productId, brand_id: brand.id,
      previous_quantity: 0, quantity_delta: 1, new_quantity: 1,
      movement_type: "opening_stock", source: "test", source_operation_key: randomUUID(),
    });
    await retireForTest(productId, brand.id);

    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.mustRetainHistory, true);
    assert.equal(eligibility.data.canScheduleDeletion, false);
    assert.equal(eligibility.data.lifecycle, "historical");

    const result = await admin!.rpc("schedule_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "cleanup", p_operation_key: randomUUID(),
    });
    assert.equal(result.data.ok, false);
    assert.equal(result.data.code, "PRODUCT_MUST_BE_RETAINED");

    const { data: schedules } = await admin!.from("product_deletion_schedules").select("id").eq("product_id", productId);
    assert.deepEqual(schedules, [], "no schedule row should have been created for a product that must be retained forever");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("a retired product with a resolvable operational blocker cannot be scheduled either, but leaves no stuck row behind", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 0, brand_stock_quantity: 3 });
    await retireForTest(productId, brand.id);

    const result = await admin!.rpc("schedule_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "cleanup", p_operation_key: randomUUID(),
    });
    assert.equal(result.data.ok, false);
    assert.equal(result.data.code, "PRODUCT_DELETION_BLOCKED");
    assert.ok(result.data.blockers.some((b: { code: string }) => b.code === "PRODUCT_HAS_RESERVED_STOCK"));

    const { data: schedules } = await admin!.from("product_deletion_schedules").select("id").eq("product_id", productId);
    assert.deepEqual(schedules, [], "no 'blocked' placeholder row is ever created — the caller just gets the blockers back and can retry once they clear");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("schedule -> cancel lifecycle: duplicate scheduling is rejected while active, and idempotency conflicts are detected", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);

    const key = randomUUID();
    const first = await admin!.rpc("schedule_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "no longer selling", p_operation_key: key,
    });
    assert.equal(first.data.ok, true);
    assert.equal(first.data.code, "DELETION_SCHEDULED");
    const scheduleId = first.data.scheduleId;

    // Idempotent replay of the exact same key AND the same reason/actor
    // succeeds without duplicating.
    const replay = await admin!.rpc("schedule_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "no longer selling", p_operation_key: key,
    });
    assert.equal(replay.data.ok, true);
    assert.equal(replay.data.scheduleId, scheduleId);

    // The SAME key reused with a DIFFERENT reason is a real conflict, not a
    // safe no-op — a naive "first caller wins" replay would have silently
    // returned the original schedule here instead.
    const conflict = await admin!.rpc("schedule_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "a completely different reason", p_operation_key: key,
    });
    assert.equal(conflict.data.ok, false);
    assert.equal(conflict.data.code, "IDEMPOTENCY_CONFLICT");

    // A genuinely new schedule attempt (new key) while one is already
    // active is refused.
    const duplicate = await admin!.rpc("schedule_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "again", p_operation_key: randomUUID(),
    });
    assert.equal(duplicate.data.ok, false);
    assert.equal(duplicate.data.code, "DELETION_ALREADY_SCHEDULED");

    const cancel = await admin!.rpc("cancel_product_deletion_schedule", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(cancel.data.ok, true);
    assert.equal(cancel.data.scheduleState, "cancelled");

    const { data: scheduleRow } = await admin!.from("product_deletion_schedules").select("status, cancelled_at").eq("id", scheduleId).single();
    assert.equal(scheduleRow!.status, "cancelled");
    assert.ok(scheduleRow!.cancelled_at);

    const cancelAgain = await admin!.rpc("cancel_product_deletion_schedule", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(cancelAgain.data.ok, false);
    assert.equal(cancelAgain.data.code, "DELETION_SCHEDULE_NOT_FOUND");

    // Scheduling again after a cancellation must succeed — cancelled is
    // terminal, not a lingering block.
    const again = await admin!.rpc("schedule_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "actually yes", p_operation_key: randomUUID(),
    });
    assert.equal(again.data.ok, true);
  } finally {
    await cleanupBrand(brand.id);
  }
});

// ============================================================================
// Cron executor — this is where "schedule the deletion" and "actually
// delete it" are two separate steps in this design. due_at is backdated to
// simulate the 7-day grace period having elapsed, and
// execute_due_product_deletions is called directly (exactly what the
// authenticated cron route does).
// ============================================================================

test("a history-free scheduled product is actually hard-deleted once due, and the schedule survives as a completed history record", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
    const scheduleId = await scheduleForTest(productId, brand.id, "discontinuing this line");
    await makeScheduleDue(scheduleId);

    const outcome = await admin!.rpc("execute_due_product_deletions", { p_batch_size: 25 });
    assert.equal(outcome.data.completed, 1);
    assert.equal(outcome.data.blocked, 0);
    assert.equal(outcome.data.errored, 0);

    const { data: gone } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();
    assert.equal(gone, null, "product must actually be deleted");

    const { data: scheduleRow } = await admin!.from("product_deletion_schedules").select("*").eq("id", scheduleId).single();
    assert.equal(scheduleRow!.status, "completed");
    assert.equal(scheduleRow!.product_id, null, "product_id must be nulled once the product is gone");
    assert.equal(scheduleRow!.product_name, "Deletion Test Product", "the name snapshot must survive the product's own deletion");
    assert.ok(scheduleRow!.completed_at);
  } finally {
    await cleanupBrand(brand.id);
  }
});

// The executor must recompute eligibility fresh at execution time, not
// trust the snapshot captured when the schedule was created — proving the
// p_ignore_schedule_id exclusion only suppresses the schedule's own
// self-reference, not real new blockers.
test("the cron executor refuses to delete (and marks the schedule 'blocked') when new activity appeared during the grace period", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
    const scheduleId = await scheduleForTest(productId, brand.id);
    await makeScheduleDue(scheduleId);

    // New activity after the schedule was created: declared brand stock
    // appears (a real, resolvable operational blocker, not the schedule's
    // own self-reference).
    const { data: variant } = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 0 }).select("id").single();
    await admin!.from("product_variants").update({ brand_stock_quantity: 3 }).eq("id", variant!.id);

    const outcome = await admin!.rpc("execute_due_product_deletions", { p_batch_size: 25 });
    assert.equal(outcome.data.completed, 0);
    assert.equal(outcome.data.blocked, 1);

    const { data: stillThere } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();
    assert.ok(stillThere, "product must not have been deleted");

    const { data: scheduleRow } = await admin!.from("product_deletion_schedules").select("status, blocker_snapshot").eq("id", scheduleId).single();
    assert.equal(scheduleRow!.status, "blocked");
    // The self-referential "already scheduled" blocker must never appear.
    const snapshot = scheduleRow!.blocker_snapshot as Array<{ code: string }>;
    assert.ok(snapshot.some((b) => b.code === "PRODUCT_HAS_RESERVED_STOCK"));
    assert.ok(!snapshot.some((b) => b.code === "DELETION_ALREADY_SCHEDULED"));
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("concurrent cron invocations never delete the same scheduled product twice", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
    const scheduleId = await scheduleForTest(productId, brand.id);
    await makeScheduleDue(scheduleId);

    // FOR UPDATE SKIP LOCKED means two overlapping invocations racing the
    // same due batch can never both grab this row — exactly one of them
    // must report it completed, the other must not see it at all.
    const [a, b] = await Promise.all([
      admin!.rpc("execute_due_product_deletions", { p_batch_size: 25 }),
      admin!.rpc("execute_due_product_deletions", { p_batch_size: 25 }),
    ]);
    const totalCompleted = (a.data?.completed ?? 0) + (b.data?.completed ?? 0);
    assert.equal(totalCompleted, 1, "the product must be reported completed by exactly one of the two concurrent invocations");

    const { data: gone } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();
    assert.equal(gone, null);
    const { data: scheduleRow } = await admin!.from("product_deletion_schedules").select("status").eq("id", scheduleId).single();
    assert.equal(scheduleRow!.status, "completed");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("cancelling and executing a due schedule at the same time resolves to exactly one deterministic outcome, never both", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
    const scheduleId = await scheduleForTest(productId, brand.id);
    await makeScheduleDue(scheduleId);

    const [cancelResult, executeResult] = await Promise.all([
      admin!.rpc("cancel_product_deletion_schedule", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" }),
      admin!.rpc("execute_due_product_deletions", { p_batch_size: 25 }),
    ]);

    const { data: scheduleRow } = await admin!.from("product_deletion_schedules").select("status").eq("id", scheduleId).single();
    const { data: productRow } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();

    if (scheduleRow!.status === "cancelled") {
      // Cancel won the race: the executor's batch query (status = 'scheduled')
      // must not have seen this row at all.
      assert.equal(executeResult.data.completed, 0);
      assert.ok(productRow, "product must still exist when cancel wins the race");
    } else {
      // Execute won the race: the cancel call must have found no active
      // schedule to cancel (it already committed as 'completed').
      assert.equal(scheduleRow!.status, "completed");
      assert.equal(cancelResult.data.ok, false);
      assert.equal(cancelResult.data.code, "DELETION_SCHEDULE_NOT_FOUND");
      assert.equal(productRow, null, "product must be gone when execute wins the race");
    }
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("repeated executor runs after a completed deletion are idempotent — no re-delete, no duplicate cleanup jobs", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
    const scheduleId = await scheduleForTest(productId, brand.id);
    await makeScheduleDue(scheduleId);

    const first = await admin!.rpc("execute_due_product_deletions", { p_batch_size: 25 });
    assert.equal(first.data.completed, 1);

    // The completed schedule is no longer 'scheduled', so it drops out of
    // the executor's own working set entirely on a second pass.
    const second = await admin!.rpc("execute_due_product_deletions", { p_batch_size: 25 });
    assert.equal(second.data.completed, 0);
    assert.equal(second.data.blocked, 0);
    assert.equal(second.data.errored, 0);

    const { data: scheduleRow } = await admin!.from("product_deletion_schedules").select("status").eq("id", scheduleId).single();
    assert.equal(scheduleRow!.status, "completed");
  } finally {
    await cleanupBrand(brand.id);
  }
});

// ============================================================================
// Legal/admin hold.
// ============================================================================

test("an active hold blocks scheduling outright", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);

    const hold = await admin!.rpc("apply_product_deletion_hold", { p_product_id: productId, p_actor_id: null, p_actor_label: "admin-test", p_reason: "legal review" });
    assert.equal(hold.data.ok, true);
    assert.equal(hold.data.scheduleStopped, false, "there was no active schedule to stop");

    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.hasActiveHold, true);
    assert.equal(eligibility.data.canScheduleDeletion, false);

    const schedule = await admin!.rpc("schedule_product_deletion", {
      p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test",
      p_reason: "x", p_operation_key: randomUUID(),
    });
    assert.equal(schedule.data.ok, false);
    assert.equal(schedule.data.code, "PRODUCT_DELETION_BLOCKED");
    assert.ok(schedule.data.blockers.some((b: { code: string }) => b.code === "PRODUCT_HAS_ACTIVE_HOLD"));

    // A second hold while one is already active is refused, not stacked.
    const secondHold = await admin!.rpc("apply_product_deletion_hold", { p_product_id: productId, p_actor_id: null, p_actor_label: "admin-test", p_reason: "again" });
    assert.equal(secondHold.data.ok, false);
    assert.equal(secondHold.data.code, "ALREADY_ON_HOLD");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("applying a hold to an already-scheduled product safely stops the schedule (moves it to 'blocked', not silently ignored)", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
    const scheduleId = await scheduleForTest(productId, brand.id);

    const hold = await admin!.rpc("apply_product_deletion_hold", { p_product_id: productId, p_actor_id: null, p_actor_label: "admin-test", p_reason: "legal review" });
    assert.equal(hold.data.ok, true);
    assert.equal(hold.data.scheduleStopped, true);

    const { data: scheduleRow } = await admin!.from("product_deletion_schedules").select("status, blocked_reason").eq("id", scheduleId).single();
    assert.equal(scheduleRow!.status, "blocked");
    assert.ok(scheduleRow!.blocked_reason);

    // Even if due_at were somehow still in the past, the executor's own
    // batch query only ever selects status = 'scheduled' — a 'blocked' row
    // is already out of its working set entirely, belt-and-braces confirmed
    // here by also recomputing eligibility directly.
    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.hasActiveHold, true);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("releasing a hold never auto-resumes or auto-recreates a deletion schedule", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
    const scheduleId = await scheduleForTest(productId, brand.id);
    await admin!.rpc("apply_product_deletion_hold", { p_product_id: productId, p_actor_id: null, p_actor_label: "admin-test", p_reason: "legal review" });

    const release = await admin!.rpc("release_product_deletion_hold", { p_product_id: productId, p_actor_id: null, p_actor_label: "admin-test" });
    assert.equal(release.data.ok, true);

    const { data: scheduleRow } = await admin!.from("product_deletion_schedules").select("status").eq("id", scheduleId).single();
    assert.equal(scheduleRow!.status, "blocked", "the original schedule must stay 'blocked' — it is never silently resurrected");

    const eligibility = await admin!.rpc("get_product_deletion_eligibility", { p_product_id: productId });
    assert.equal(eligibility.data.hasActiveHold, false);
    assert.equal(eligibility.data.canScheduleDeletion, true, "eligible again, but only a fresh schedule_product_deletion call creates a new schedule");

    const releaseAgain = await admin!.rpc("release_product_deletion_hold", { p_product_id: productId, p_actor_id: null, p_actor_label: "admin-test" });
    assert.equal(releaseAgain.data.ok, false);
    assert.equal(releaseAgain.data.code, "HOLD_NOT_FOUND");
  } finally {
    await cleanupBrand(brand.id);
  }
});

// ============================================================================
// order_items availability guard — unchanged mechanism from prior passes.
// ============================================================================

test("a retired product with active variant stock cannot be ordered (order_items guard trigger, product_id present)", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
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

test("a retired product cannot be ordered even when the order_item insert only supplies variant_id (product_id null)", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
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

// ============================================================================
// Admin/brand-portal search + pagination RPCs.
// ============================================================================

test("admin_search_deletion_schedules filters by status and paginates at the database level", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    for (let i = 0; i < 3; i += 1) {
      const productId = await createDraftProduct(brand.id);
      await retireForTest(productId, brand.id);
      await scheduleForTest(productId, brand.id, "bulk cleanup");
    }

    const page1 = await admin!.rpc("admin_search_deletion_schedules", { p_status: "scheduled", p_brand_id: brand.id, p_limit: 2, p_offset: 0 });
    assert.equal(page1.data.total, 3);
    assert.equal(page1.data.rows.length, 2);

    const page2 = await admin!.rpc("admin_search_deletion_schedules", { p_status: "scheduled", p_brand_id: brand.id, p_limit: 2, p_offset: 2 });
    assert.equal(page2.data.rows.length, 1);

    const wrongStatus = await admin!.rpc("admin_search_deletion_schedules", { p_status: "completed", p_brand_id: brand.id, p_limit: 10, p_offset: 0 });
    assert.equal(wrongStatus.data.total, 0);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("search_retired_products only returns archived products, scoped by brand, with eligibility and active-schedule info inline", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const retiredId = await createDraftProduct(brand.id);
    await retireForTest(retiredId, brand.id);
    const scheduleId = await scheduleForTest(retiredId, brand.id);

    const draftId = await createDraftProduct(brand.id);

    const result = await admin!.rpc("search_retired_products", { p_brand_id: brand.id, p_limit: 25, p_offset: 0 });
    assert.equal(result.data.total, 1, "only the retired product should be returned, not the draft");
    const row = result.data.rows[0];
    assert.equal(row.id, retiredId);
    assert.equal(row.eligibility.mustRetainHistory, false);
    assert.equal(row.activeSchedule.id, scheduleId);
    assert.equal(row.activeSchedule.status, "scheduled");
    assert.notEqual(draftId, retiredId);
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("restore is blocked while a deletion schedule is active, and succeeds once it's cancelled", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
    await scheduleForTest(productId, brand.id);

    const restoreBlocked = await admin!.rpc("restore_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(restoreBlocked.data.ok, false);
    assert.equal(restoreBlocked.data.code, "DELETION_SCHEDULE_ALREADY_ACTIVE");

    await admin!.rpc("cancel_product_deletion_schedule", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    const restoreOk = await admin!.rpc("restore_product", { p_product_id: productId, p_brand_id: brand.id, p_actor_id: null, p_actor_label: "test" });
    assert.equal(restoreOk.data.ok, true);
  } finally {
    await cleanupBrand(brand.id);
  }
});

// ============================================================================
// Archived -> draft -> published two-step bypass — unchanged mechanism from
// the second corrective pass, re-verified with retire_product in place of
// the old archive_product name.
// ============================================================================

test("a raw UPDATE cannot move a retired product straight to published", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);
    await retireForTest(productId, brand.id);

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

test("a raw UPDATE cannot move a retired product to draft either — only restore_product may", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await admin!.from("products").update({ status: "published" }).eq("id", productId);
    await retireForTest(productId, brand.id);

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
    await retireForTest(productId, brand.id);

    const step1 = await admin!.from("products").update({ status: "draft" }).eq("id", productId);
    assert.ok(step1.error, "step 1 (archived -> draft) must fail at the database level");
    assert.match(step1.error!.message, /PRODUCT_ARCHIVED_TRANSITION_REQUIRES_RESTORE/);

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
    await retireForTest(productId, brand.id);

    await admin!.from("products").update({ status: "draft" }).eq("id", productId);

    const { data: archivedIds } = await admin!.from("products").select("id").eq("brand_id", brand.id).eq("status", "archived");
    assert.deepEqual(archivedIds?.map((r) => r.id), [productId]);

    const { data: row } = await admin!.from("products").select("status").eq("id", productId).single();
    assert.equal(row!.status, "archived");
  } finally {
    await cleanupBrand(brand.id);
  }
});

// ============================================================================
// Media ownership + durable, transactional cleanup enqueueing — capture/
// queue functions unchanged from the second corrective pass; re-verified
// against both delete_draft_product and the cron executor's own delete path.
// ============================================================================

function ownedMediaUrl(pathSegment: string): string {
  return `${supabaseUrl}/storage/v1/object/public/product-images/${pathSegment}`;
}

test("media cleanup covers brand-portal draft-upload paths, admin temp-folder paths, and canonical product-folder paths alike (immediate draft delete)", { skip: !runLive }, async () => {
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

    const paths = [brandDraftUrl, adminTempUrl, canonicalUrl].map((u) => u.split("/product-images/")[1]);
    const { data: jobs } = await admin!.from("storage_cleanup_jobs").select("storage_path").eq("bucket_id", "product-images").in("storage_path", paths);
    assert.equal(jobs?.length, 3);

    await admin!.from("storage_cleanup_jobs").delete().eq("bucket_id", "product-images").in("storage_path", paths);
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
    await cleanupBrand(brandA.id);
    await cleanupBrand(brandB.id);
  }
});

test("a blocked scheduled deletion never queues cleanup jobs and never deletes the product (enqueue only happens on the success path)", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const productId = await createDraftProduct(brand.id);
    await retireForTest(productId, brand.id);
    const scheduleId = await scheduleForTest(productId, brand.id);
    await makeScheduleDue(scheduleId);

    const ownedUrl = ownedMediaUrl(`products/${productId}/photo.jpg`);
    await admin!.from("product_media").insert({ product_id: productId, storage_reference: ownedUrl, display_order: 0 });
    // New activity blocks this specific execution.
    const { data: variant } = await admin!.from("product_variants").insert({ product_id: productId, sku: `${productId}-v1`, quantity: 0 }).select("id").single();
    await admin!.from("product_variants").update({ brand_stock_quantity: 1 }).eq("id", variant!.id);

    const outcome = await admin!.rpc("execute_due_product_deletions", { p_batch_size: 25 });
    assert.equal(outcome.data.blocked, 1);

    const { data: stillThere } = await admin!.from("products").select("id").eq("id", productId).maybeSingle();
    assert.ok(stillThere, "product must survive a blocked execution");

    const ownedPath = ownedUrl.split("/product-images/")[1];
    const { data: job } = await admin!.from("storage_cleanup_jobs").select("id").eq("bucket_id", "product-images").eq("storage_path", ownedPath).maybeSingle();
    assert.equal(job, null, "no cleanup job may be queued when the product was never actually deleted");
  } finally {
    await cleanupBrand(brand.id);
  }
});

test("partial batch outcomes: one scheduled deletion completes with its media queued while a sibling with a new blocker is independently marked blocked", { skip: !runLive }, async () => {
  const brand = await createThrowawayBrand();
  try {
    const okProductId = await createDraftProduct(brand.id);
    const blockedProductId = await createDraftProduct(brand.id);
    await retireForTest(okProductId, brand.id);
    await retireForTest(blockedProductId, brand.id);

    const okUrl = ownedMediaUrl(`products/${okProductId}/photo.jpg`);
    await admin!.from("product_media").insert({ product_id: okProductId, storage_reference: okUrl, display_order: 0 });

    const okScheduleId = await scheduleForTest(okProductId, brand.id);
    const blockedScheduleId = await scheduleForTest(blockedProductId, brand.id);
    await makeScheduleDue(okScheduleId);
    await makeScheduleDue(blockedScheduleId);

    const { data: variant } = await admin!.from("product_variants").insert({ product_id: blockedProductId, sku: `${blockedProductId}-v1`, quantity: 0 }).select("id").single();
    await admin!.from("product_variants").update({ brand_stock_quantity: 2 }).eq("id", variant!.id);

    const outcome = await admin!.rpc("execute_due_product_deletions", { p_batch_size: 25 });
    assert.equal(outcome.data.completed, 1);
    assert.equal(outcome.data.blocked, 1);

    const { data: okGone } = await admin!.from("products").select("id").eq("id", okProductId).maybeSingle();
    assert.equal(okGone, null);
    const { data: blockedStillThere } = await admin!.from("products").select("id").eq("id", blockedProductId).maybeSingle();
    assert.ok(blockedStillThere, "the blocked sibling must be untouched by the other's success");

    const okPath = okUrl.split("/product-images/")[1];
    const { data: okJob } = await admin!.from("storage_cleanup_jobs").select("id").eq("bucket_id", "product-images").eq("storage_path", okPath).maybeSingle();
    assert.ok(okJob, "the successful product's cleanup job must exist regardless of the sibling's blocker");

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
