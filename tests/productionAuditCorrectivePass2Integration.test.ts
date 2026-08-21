import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanupOrFail, resolveLiveSupabaseTestConfig } from "./helpers/liveSupabaseTestConfig.ts";

// Destructive by design, but impossible to enable accidentally. The shared
// loader requires RUN_LIVE_RLS=1, an exact disposable-project allowlist, and
// rejects Mahaly production even if somebody explicitly allowlists it. This
// suite adds a third opt-in because it creates captured-payment fixtures.
const liveConfig = resolveLiveSupabaseTestConfig();
const canRun = Boolean(liveConfig?.serviceRoleKey)
  && process.env.RUN_PRODUCTION_AUDIT_PASS2_INTEGRATION === "1";

function admin(): SupabaseClient {
  return createClient(liveConfig!.supabaseUrl, liveConfig!.serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface CatalogFixture {
  brandId: string;
  brandSlug: string;
  productId: string;
  variantId: string;
}

interface AttemptFixture {
  userId: string;
  email: string;
  attemptId: string;
  catalog: CatalogFixture;
  cartSnapshot: Array<Record<string, unknown>>;
}

async function createUser(client: SupabaseClient, label: string): Promise<{ id: string; email: string }> {
  const email = `audit-${label}-${randomUUID()}@example.invalid`;
  const { data, error } = await client.auth.admin.createUser({
    email,
    password: `Aa1!${randomUUID()}`,
    email_confirm: true,
    user_metadata: { full_name: "Disposable Audit Fixture" },
  });
  assert.equal(error, null, error?.message);
  assert.ok(data.user?.id);
  return { id: data.user.id, email };
}

async function createCatalog(client: SupabaseClient, label: string): Promise<CatalogFixture> {
  const brandSlug = `audit-${label}-${randomUUID()}`;
  const { data: brand, error: brandError } = await client
    .from("brands")
    .insert({
      slug: brandSlug,
      name: brandSlug,
      category: "Test",
      story_body: "Disposable production-audit fixture",
      is_active: true,
      is_mahaly_partner: true,
      fulfillment_mode: "zakhnook_fulfilled",
      sku_prefix: randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase(),
    })
    .select("id")
    .single();
  assert.equal(brandError, null, brandError?.message);

  const { data: taxonomy, error: taxonomyError } = await client
    .from("taxonomy_nodes")
    .select("id")
    .eq("level", 3)
    .limit(1)
    .single();
  assert.equal(taxonomyError, null, taxonomyError?.message);

  const productId = `audit-product-${randomUUID()}`;
  const { error: productError } = await client.from("products").insert({
    id: productId,
    brand_id: brand!.id,
    brand_slug: brandSlug,
    brand_name: brandSlug,
    name: "Disposable Audit Product",
    status: "published",
    price: 2_000,
    currency: "EGP",
    image: "/images/placeholder-product.webp",
    sku: `AUD-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
    product_type_id: taxonomy!.id,
    audience: "unisex",
    launch_policy: "show_now",
    first_stocked_at: new Date().toISOString(),
  });
  assert.equal(productError, null, productError?.message);

  const { data: variant, error: variantError } = await client
    .from("product_variants")
    .insert({
      product_id: productId,
      sku: `AUD-V-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
      combo_key: "default",
      quantity: 20,
      brand_stock_quantity: 20,
    })
    .select("id")
    .single();
  assert.equal(variantError, null, variantError?.message);
  return { brandId: brand!.id, brandSlug, productId, variantId: variant!.id };
}

function cartFor(catalog: CatalogFixture, couponDiscountEgp = 0): Array<Record<string, unknown>> {
  return [{
    productId: catalog.productId,
    variantId: catalog.variantId,
    name: "Disposable Audit Product",
    brand: catalog.brandSlug,
    brandSlug: catalog.brandSlug,
    price: 2_000,
    currency: "EGP",
    size: "One Size",
    color: "Test",
    quantity: 1,
    image: "/images/placeholder-product.webp",
    originalUnitPrice: 2_000,
    discountPercentSnapshot: null,
    discountSource: "none",
    itemCouponDiscountEgp: couponDiscountEgp,
  }];
}

const shippingSnapshot = {
  firstName: "Disposable",
  lastName: "Fixture",
  email: "audit@example.invalid",
  phone: "+201000000000",
  address: "Disposable test address",
  city: "Cairo",
  governorate: "Cairo",
};

async function createAttempt(
  client: SupabaseClient,
  userId: string,
  catalog: CatalogFixture,
  options: { couponCode?: string; couponDiscountEgp?: number } = {}
): Promise<{ id: string; cartSnapshot: Array<Record<string, unknown>> }> {
  const discount = options.couponDiscountEgp ?? 0;
  const cartSnapshot = cartFor(catalog, discount);
  const { data, error } = await client.rpc("create_payment_attempt", {
    p_user_id: userId,
    p_idempotency_actor: `user:${userId}`,
    p_client_request_id: randomUUID(),
    p_request_hash: randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
    p_amount_cents: Math.round((2_000 - discount) * 100),
    p_currency: "EGP",
    p_cart_snapshot: cartSnapshot,
    p_shipping_snapshot: shippingSnapshot,
    p_coupon_snapshot: options.couponCode
      ? { code: options.couponCode, discountType: "fixed", discountValue: discount, totalDiscountEgp: discount }
      : null,
    p_expires_in_seconds: 3_600,
  });
  if (error) throw new Error(error.message);
  return { id: (data as { payment_attempt_id: string }).payment_attempt_id, cartSnapshot };
}

async function createAttemptFixture(client: SupabaseClient, label: string): Promise<AttemptFixture> {
  const user = await createUser(client, label);
  const catalog = await createCatalog(client, label);
  const attempt = await createAttempt(client, user.id, catalog);
  return { userId: user.id, email: user.email, attemptId: attempt.id, catalog, cartSnapshot: attempt.cartSnapshot };
}

async function fulfillAttempt(client: SupabaseClient, fixture: AttemptFixture): Promise<string> {
  const { data: attemptRow, error: attemptReadError } = await client
    .from("payment_attempts")
    .select("amount_cents")
    .eq("id", fixture.attemptId)
    .single();
  assert.equal(attemptReadError, null, attemptReadError?.message);
  const providerOrderId = Math.floor(Date.now() + Math.random() * 100_000);
  const { error: intentionError } = await client.rpc("mark_paymob_intention_created", {
    p_payment_attempt_id: fixture.attemptId,
    p_provider_intention_id: `audit-intention-${randomUUID()}`,
    p_provider_order_id: providerOrderId,
  });
  assert.equal(intentionError, null, intentionError?.message);

  const { error: paidError } = await client.rpc("mark_payment_attempt_paid", {
    p_payment_attempt_id: fixture.attemptId,
    p_provider_transaction_id: `audit-transaction-${randomUUID()}`,
    p_provider_event_id: `audit-paid-event-${randomUUID()}`,
    p_amount_cents: Number(attemptRow!.amount_cents),
    p_currency: "EGP",
  });
  assert.equal(paidError, null, paidError?.message);
  const { data: fulfilled, error: fulfillmentError } = await client.rpc("place_paid_order", {
    p_payment_attempt_id: fixture.attemptId,
  });
  assert.equal(fulfillmentError, null, fulfillmentError?.message);
  assert.equal((fulfilled as { status: string }).status, "fulfilled");

  const { data: order, error: orderError } = await client
    .from("orders")
    .select("id")
    .eq("payment_attempt_id", fixture.attemptId)
    .single();
  assert.equal(orderError, null, orderError?.message);
  return order!.id;
}

async function cleanupUnfulfilledFixture(client: SupabaseClient, fixture: AttemptFixture): Promise<void> {
  await cleanupOrFail("production-audit integration cleanup", [
    () => client.from("payment_attempts").delete().eq("id", fixture.attemptId),
    () => client.from("inventory_movements").delete().eq("brand_id", fixture.catalog.brandId),
    () => client.from("product_variants").delete().eq("id", fixture.catalog.variantId),
    () => client.from("products").delete().eq("id", fixture.catalog.productId),
    () => client.from("brands").delete().eq("id", fixture.catalog.brandId),
    () => client.auth.admin.deleteUser(fixture.userId),
  ]);
}

test("provider-confirmed partial then full refund is the only path that unlocks card-order cancellation", { skip: !canRun }, async () => {
  const client = admin();
  const fixture = await createAttemptFixture(client, "refund-lifecycle");
  const orderId = await fulfillAttempt(client, fixture);

  const overshoot = await client.rpc("request_order_refund", {
    p_order_id: orderId,
    p_actor_id: fixture.userId,
    p_amount_cents: 200_001,
    p_note: "overshoot must fail",
  });
  assert.match(overshoot.error?.message ?? "", /REFUND_EXCEEDS_CAPTURED_BALANCE/);

  const firstRequest = await client.rpc("request_order_refund", {
    p_order_id: orderId,
    p_actor_id: fixture.userId,
    p_amount_cents: 100_000,
    p_note: "first half",
  });
  assert.equal(firstRequest.error, null, firstRequest.error?.message);
  const beforeConfirmation = await client.from("orders").select("payment_status").eq("id", orderId).single();
  assert.equal(beforeConfirmation.data?.payment_status, "paid", "a staff request alone must not unlock cancellation");

  const firstProviderEvent = `audit-refund-event-${randomUUID()}`;
  const firstReference = `audit-refund-${randomUUID()}`;
  const firstConfirmation = await client.rpc("record_provider_refund_confirmation", {
    p_payment_attempt_id: fixture.attemptId,
    p_provider_reference: firstReference,
    p_provider_event_id: firstProviderEvent,
    p_amount_cents: 100_000,
    p_currency: "EGP",
  });
  assert.equal(firstConfirmation.error, null, firstConfirmation.error?.message);
  const replay = await client.rpc("record_provider_refund_confirmation", {
    p_payment_attempt_id: fixture.attemptId,
    p_provider_reference: firstReference,
    p_provider_event_id: firstProviderEvent,
    p_amount_cents: 100_000,
    p_currency: "EGP",
  });
  assert.equal(replay.error, null, replay.error?.message);
  assert.equal((replay.data as { replayed: boolean }).replayed, true);

  const partial = await client.from("orders").select("payment_status").eq("id", orderId).single();
  assert.equal(partial.data?.payment_status, "partially_refunded");
  const blockedCancellation = await client.rpc("cancel_order", { p_order_id: orderId });
  assert.match(blockedCancellation.error?.message ?? "", /PAID_ORDER_REQUIRES_REFUND_REVIEW/);

  const secondRequest = await client.rpc("request_order_refund", {
    p_order_id: orderId,
    p_actor_id: fixture.userId,
    p_amount_cents: 100_000,
    p_note: "remaining half",
  });
  assert.equal(secondRequest.error, null, secondRequest.error?.message);
  const secondConfirmation = await client.rpc("record_provider_refund_confirmation", {
    p_payment_attempt_id: fixture.attemptId,
    p_provider_reference: `audit-refund-${randomUUID()}`,
    p_provider_event_id: `audit-refund-event-${randomUUID()}`,
    p_amount_cents: 100_000,
    p_currency: "EGP",
  });
  assert.equal(secondConfirmation.error, null, secondConfirmation.error?.message);

  const full = await client.from("orders").select("payment_status").eq("id", orderId).single();
  assert.equal(full.data?.payment_status, "refunded");
  const cancellation = await client.rpc("cancel_order", { p_order_id: orderId });
  assert.equal(cancellation.error, null, cancellation.error?.message);
  // Provider refund events are intentionally immutable. This fixture stays
  // in the explicitly disposable database; reset that project after the job.
});

test("account deletion and payment-attempt creation serialize on the same profile row", { skip: !canRun }, async () => {
  const firstClient = admin();
  const secondClient = admin();
  const fixture = await createAttemptFixture(firstClient, "account-race-seed");
  const deleted = await firstClient.from("payment_attempts").delete().eq("id", fixture.attemptId);
  assert.equal(deleted.error, null, deleted.error?.message);

  const createPromise = createAttempt(secondClient, fixture.userId, fixture.catalog)
    .then((value) => ({ ok: true as const, value }))
    .catch((error: unknown) => ({ ok: false as const, error }));
  const [lock, create] = await Promise.all([
    firstClient.rpc("lock_account_for_deletion", { p_user_id: fixture.userId }),
    createPromise,
  ]);
  assert.notEqual(!lock.error, create.ok, "exactly one competing operation must succeed");
  if (!lock.error) {
    const unlocked = await firstClient.rpc("unlock_account_for_deletion", { p_user_id: fixture.userId });
    assert.equal(unlocked.error, null, unlocked.error?.message);
  } else {
    assert.match(lock.error.message, /PAYMENT_ATTEMPT_IN_PROGRESS/);
  }
  if (create.ok) {
    const removed = await firstClient.from("payment_attempts").delete().eq("id", create.value.id);
    assert.equal(removed.error, null, removed.error?.message);
  }
  await cleanupUnfulfilledFixture(firstClient, { ...fixture, attemptId: randomUUID() });
});

test("payment snapshot redaction destroys shipping PII and preserves accounting cart facts", { skip: !canRun }, async () => {
  const client = admin();
  const fixture = await createAttemptFixture(client, "snapshot-redaction");
  const before = await client.from("payment_attempts").select("cart_snapshot").eq("id", fixture.attemptId).single();
  assert.equal(before.error, null, before.error?.message);
  const redacted = await client.rpc("redact_deleted_account_payment_snapshots", { p_user_id: fixture.userId });
  assert.equal(redacted.error, null, redacted.error?.message);
  const after = await client
    .from("payment_attempts")
    .select("cart_snapshot, shipping_snapshot")
    .eq("id", fixture.attemptId)
    .single();
  assert.equal(after.error, null, after.error?.message);
  assert.deepEqual(after.data?.cart_snapshot, before.data?.cart_snapshot);
  assert.equal((after.data?.shipping_snapshot as { redacted?: boolean }).redacted, true);
  await cleanupUnfulfilledFixture(client, fixture);
});

test("one max-use coupon cannot be reserved by two concurrent card attempts", { skip: !canRun }, async () => {
  const client = admin();
  const fixtureA = await createAttemptFixture(client, "coupon-a-seed");
  await client.from("payment_attempts").delete().eq("id", fixtureA.attemptId);
  const userB = await createUser(client, "coupon-b");
  const code = `AUD${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const couponInsert = await client.from("coupons").insert({
    code, discount_type: "fixed", discount_value: 10, max_uses: 1, used_count: 0, active: true,
  });
  assert.equal(couponInsert.error, null, couponInsert.error?.message);

  const results = await Promise.all([
    createAttempt(admin(), fixtureA.userId, fixtureA.catalog, { couponCode: code, couponDiscountEgp: 10 })
      .then((value) => ({ ok: true as const, value }))
      .catch((error: unknown) => ({ ok: false as const, error })),
    createAttempt(admin(), userB.id, fixtureA.catalog, { couponCode: code, couponDiscountEgp: 10 })
      .then((value) => ({ ok: true as const, value }))
      .catch((error: unknown) => ({ ok: false as const, error })),
  ]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.match(String(results.find((result) => !result.ok)?.error), /COUPON_LIMIT_REACHED/);

  for (const result of results) {
    if (result.ok) await client.from("payment_attempts").delete().eq("id", result.value.id);
  }
  await cleanupOrFail("coupon-concurrency cleanup", [
    () => client.from("coupons").delete().eq("code", code),
    () => client.from("inventory_movements").delete().eq("brand_id", fixtureA.catalog.brandId),
    () => client.from("product_variants").delete().eq("id", fixtureA.catalog.variantId),
    () => client.from("products").delete().eq("id", fixtureA.catalog.productId),
    () => client.from("brands").delete().eq("id", fixtureA.catalog.brandId),
    () => client.auth.admin.deleteUser(fixtureA.userId),
    () => client.auth.admin.deleteUser(userB.id),
  ]);
});

test("COD observes an outstanding card coupon reservation", { skip: !canRun }, async () => {
  const client = admin();
  const fixture = await createAttemptFixture(client, "coupon-cross-channel-seed");
  await client.from("payment_attempts").delete().eq("id", fixture.attemptId);
  const code = `AUD${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const couponInsert = await client.from("coupons").insert({
    code, discount_type: "fixed", discount_value: 10, max_uses: 1, used_count: 0, active: true,
  });
  assert.equal(couponInsert.error, null, couponInsert.error?.message);
  const reservation = await createAttempt(client, fixture.userId, fixture.catalog, { couponCode: code, couponDiscountEgp: 10 });

  const cod = await client.rpc("place_order", {
    p_shipping_name: "Disposable Fixture",
    p_shipping_email: fixture.email,
    p_shipping_phone: shippingSnapshot.phone,
    p_shipping_address: shippingSnapshot.address,
    p_shipping_city: shippingSnapshot.city,
    p_shipping_governorate: shippingSnapshot.governorate,
    p_user_id: fixture.userId,
    p_items: cartFor(fixture.catalog),
    p_idempotency_key: randomUUID(),
    p_idempotency_actor: `user:${fixture.userId}`,
    p_request_hash: randomUUID().replaceAll("-", "").padEnd(64, "0").slice(0, 64),
    p_coupon_code: code,
    p_address_id: null,
    p_flat_shipping_fee_egp: 0,
    p_free_shipping_threshold_egp: 1_500,
  });
  assert.match(cod.error?.message ?? "", /COUPON_LIMIT_REACHED/);
  await client.from("payment_attempts").delete().eq("id", reservation.id);
  await cleanupOrFail("coupon-cross-channel cleanup", [
    () => client.from("coupons").delete().eq("code", code),
    () => client.from("inventory_movements").delete().eq("brand_id", fixture.catalog.brandId),
    () => client.from("product_variants").delete().eq("id", fixture.catalog.variantId),
    () => client.from("products").delete().eq("id", fixture.catalog.productId),
    () => client.from("brands").delete().eq("id", fixture.catalog.brandId),
    () => client.auth.admin.deleteUser(fixture.userId),
  ]);
});

test("fulfilled card checkout converts its coupon reservation exactly once inside place_paid_order", { skip: !canRun }, async () => {
  const client = admin();
  const seeded = await createAttemptFixture(client, "coupon-conversion-seed");
  await client.from("payment_attempts").delete().eq("id", seeded.attemptId);
  const code = `AUD${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const couponInsert = await client.from("coupons").insert({
    code, discount_type: "fixed", discount_value: 10, max_uses: 5, used_count: 0, active: true,
  });
  assert.equal(couponInsert.error, null, couponInsert.error?.message);
  const attempt = await createAttempt(client, seeded.userId, seeded.catalog, {
    couponCode: code,
    couponDiscountEgp: 10,
  });
  const fixture = { ...seeded, attemptId: attempt.id, cartSnapshot: attempt.cartSnapshot };
  await fulfillAttempt(client, fixture);

  const firstCount = await client.from("coupons").select("used_count").eq("code", code).single();
  assert.equal(firstCount.error, null, firstCount.error?.message);
  assert.equal(firstCount.data?.used_count, 1);

  const replay = await client.rpc("place_paid_order", { p_payment_attempt_id: fixture.attemptId });
  assert.equal(replay.error, null, replay.error?.message);
  assert.equal((replay.data as { replayed: boolean }).replayed, true);
  const replayCount = await client.from("coupons").select("used_count").eq("code", code).single();
  assert.equal(replayCount.data?.used_count, 1, "a webhook replay must not consume the coupon twice");
  // This fulfilled fixture is retained only in the explicitly disposable
  // target so its cross-table accounting evidence can be inspected after a
  // failure. The CI target must be reset between destructive live runs.
});
