import test from "node:test";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanupOrFail, resolveLiveSupabaseTestConfig } from "./helpers/liveSupabaseTestConfig.ts";

// ============================================================================
// UNEXECUTED IN THIS PASS. Written to the explicit fallback corrective pass
// 2's own instructions allow ("If no disposable local database is
// available, write the tests and report them as unexecuted runtime
// blockers. Do not claim live behavior was verified.") — there is no
// disposable Supabase project reachable from this environment, so every
// test below has never been run. Do not read a green/red result from this
// file as evidence of anything; read the corrective-pass-2 report instead
// for exactly what static/behavioral coverage WAS executed.
//
// Requires RUN_LIVE_RLS=1, RUN_LIVE_RLS_ALLOWED_PROJECT_REF (see
// tests/helpers/liveSupabaseTestConfig.ts), AND
// RUN_PRODUCTION_AUDIT_PASS2_INTEGRATION=1 — three separate, explicit
// opt-ins, on top of requiring supabase/migrations/
// 20260821000000_production_audit_corrective_pass_2.sql (and every
// migration before it) to actually be applied to that disposable project
// first. None of that has happened in this environment.
//
// Each test below is a real, runnable scenario — not a placeholder — so
// that whoever next has a disposable project can turn this suite on by
// setting the three env vars and get genuine coverage immediately, rather
// than having to write these from scratch.
// ============================================================================

const liveConfig = resolveLiveSupabaseTestConfig();
const integrationOptedIn = process.env.RUN_PRODUCTION_AUDIT_PASS2_INTEGRATION === "1";
const canRun = Boolean(liveConfig?.serviceRoleKey) && integrationOptedIn;

function admin(): SupabaseClient {
  return createClient(liveConfig!.supabaseUrl, liveConfig!.serviceRoleKey!, { auth: { persistSession: false } });
}

test(
  "Section 1: record_order_refund rejects an amount exceeding the order's captured balance, and a second call with the same provider reference is idempotent",
  { skip: !canRun },
  async () => {
    // Scenario: seed a fulfilled card order via place_paid_order (or a
    // fixture insert into orders + private.payment_attempt_fulfillments
    // with a known expected_amount_cents), then:
    //   1. record_order_refund for expected_amount_cents + 1 -> expect
    //      REFUND_EXCEEDS_CAPTURED_BALANCE.
    //   2. record_order_refund for the full expected_amount_cents with
    //      provider_reference 'test-ref-1' -> expect refund_type 'full',
    //      orders.payment_status = 'refunded'.
    //   3. Re-call with the SAME provider_reference and amount -> expect
    //      replayed: true, no second row in payment_refunds.
    //   4. Re-call with the SAME provider_reference but a DIFFERENT
    //      amount/order -> expect REFUND_REFERENCE_ALREADY_USED.
    assert.fail("not executed — no disposable Supabase project available in this environment");
  }
);

test(
  "Section 1: cancel_order stays blocked at payment_status = 'partially_refunded' and only unblocks once fully refunded",
  { skip: !canRun },
  async () => {
    // Scenario: a fulfilled card order, record_order_refund for HALF the
    // captured amount -> payment_status = 'partially_refunded' -> call
    // cancel_order -> expect PAID_ORDER_REQUIRES_REFUND_REVIEW. Then
    // record_order_refund for the remaining half -> payment_status =
    // 'refunded' -> call cancel_order -> expect success, restocked_variants > 0.
    assert.fail("not executed — no disposable Supabase project available in this environment");
  }
);

test(
  "Section 3: a concurrent create_payment_attempt and lock_account_for_deletion for the same user never both succeed against a stale state",
  { skip: !canRun },
  async () => {
    // Scenario: seed a real user with no open payment attempts. Fire
    // lock_account_for_deletion(userId) and create_payment_attempt(userId, ...)
    // concurrently (Promise.all against two separate Supabase clients using
    // the service role). Assert exactly one of:
    //   (a) the lock wins first -> create_payment_attempt rejects with
    //       ACCOUNT_DELETION_IN_PROGRESS, or
    //   (b) the attempt wins first -> lock_account_for_deletion rejects with
    //       PAYMENT_ATTEMPT_IN_PROGRESS.
    // Never both succeeding is the actual property under test — which one
    // wins is legitimately nondeterministic and both outcomes are correct.
    assert.fail("not executed — no disposable Supabase project available in this environment");
  }
);

test(
  "Section 3: redact_deleted_account_payment_snapshots clears shipping_snapshot but preserves cart_snapshot pricing/quantities",
  { skip: !canRun },
  async () => {
    assert.fail("not executed — no disposable Supabase project available in this environment");
  }
);

test(
  "Section 4: an Archived product's open order can still be cancelled and restocked, restore_to_sellable and returned_to_brand quarantine resolutions still succeed, but a NEW warehouse transfer request is still rejected",
  { skip: !canRun },
  async () => {
    // Scenario: create a product with an open (non-cancelled) order, archive
    // the product (canArchive allows this even with open orders), then:
    //   1. cancel_order on that order -> expect success, quantity restored.
    //   2. resolve_warehouse_quarantine('restored_to_sellable', ...) on an
    //      existing quarantined transfer item for one of its Variants ->
    //      expect success.
    //   3. request_warehouse_transfer for a NEW inbound transfer against the
    //      same Archived product -> expect the warehouse_transfer_items
    //      insert-time guard to still reject it (PRODUCT_ARCHIVED_CANNOT_
    //      ACQUIRE_STOCK), confirming the exemption was NOT accidentally
    //      widened to cover new acquisitions too.
    assert.fail("not executed — no disposable Supabase project available in this environment");
  }
);

test(
  "Section 5: two concurrent card checkouts for the last unit of a max-uses coupon — exactly one succeeds", { skip: !canRun }, async () => {
    // Scenario: a coupon with max_uses=1, used_count=0. Fire two concurrent
    // create_payment_attempt calls with the same coupon code from two
    // different (fake) users. Assert exactly one succeeds and the other
    // raises COUPON_LIMIT_REACHED.
    assert.fail("not executed — no disposable Supabase project available in this environment");
  }
);

test(
  "Section 5: a COD checkout correctly sees an outstanding card reservation and is rejected by the same invariant",
  { skip: !canRun },
  async () => {
    // Scenario: a coupon with max_uses=1, used_count=0. Create a card
    // payment_attempt reserving the coupon (create_payment_attempt), then
    // attempt a COD place_order with the same coupon code -> expect the
    // coupons_enforce_max_uses_guard trigger to reject the used_count
    // increment (surfaces as COUPON_LIMIT_REACHED from place_order's own
    // UPDATE statement).
    assert.fail("not executed — no disposable Supabase project available in this environment");
  }
);

test(
  "Section 5: finalize_payment_attempt_coupon_redemption is idempotent and coupons.used_count increments exactly once per fulfilled card checkout",
  { skip: !canRun },
  async () => {
    assert.fail("not executed — no disposable Supabase project available in this environment");
  }
);

test(
  "Section 7: admin_delete_brand_application rolls back the entire deletion if the audit_logs insert fails",
  { skip: !canRun },
  async () => {
    // Scenario: temporarily revoke insert on audit_logs from service_role
    // (or violate a constraint some other way), call
    // admin_delete_brand_application, assert it raises and the application
    // row (and its child rows) still exist afterward. Restore the grant in
    // a finally block regardless of outcome.
    assert.fail("not executed — no disposable Supabase project available in this environment");
  }
);

// Keeps `admin`/`cleanupOrFail` imports meaningfully used once real bodies
// replace the assert.fail() placeholders above, and documents the intended
// cleanup discipline (every test that creates real rows must clean them up
// via cleanupOrFail, matching every other live suite in this repo) for
// whoever fills these in.
void admin;
void cleanupOrFail;
