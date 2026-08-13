import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPaymobIntentionForCart } from "../lib/payments/createIntentionForCart.ts";
import type {
  CreateIntentionDeps,
  CreatePaymentAttemptInput,
  CreatePaymentAttemptResult,
} from "../lib/payments/createIntentionForCart.ts";
import type { ProductLookupRow } from "../lib/payments/intentionCart.ts";
import type { ProductVariant, ShippingSettingsContent } from "../types/index.ts";

// Item 8 of the second corrective pass: coverage for direct anon access to
// products, open-transition storefront visibility, card intention/transition
// races, both cancellation directions, cancellation with open documents,
// missing-only quarantine, and quarantine idempotency conflicts. Follows the
// established repo pattern — static compacted-SQL assertions against the
// migration text where there's no live database, plus real pure-function
// exercises where the logic already lives in plain TypeScript
// (createIntentionForCart.ts). See tests/fulfillmentIntegration.test.ts for
// scenario stubs awaiting an isolated migrated database.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}
function compact(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ").toLowerCase().replace(/\s+/g, "");
}

const VIEW_MIGRATION = read("supabase/migrations/20260814000006_storefront_launch_gate_view.sql");
const MODE_MIGRATION = read("supabase/migrations/20260814000002_fulfillment_mode.sql");
const DOCS_MIGRATION = read("supabase/migrations/20260814000003_warehouse_documents.sql");
const DOCS_SQL = compact(DOCS_MIGRATION);
const PRODUCT_LAUNCH_MIGRATION = read("supabase/migrations/20260814000004_product_launch_state.sql");
const PERMISSIONS_MIGRATION = read("supabase/migrations/20260814000005_inventory_permission_boundaries.sql");

// ---------------------------------------------------------------------------
// 1. Direct anon/authenticated access to public.products
// ---------------------------------------------------------------------------

test("item 8 / anon access: the products RLS SELECT policy itself (not just the view) enforces the launch gate, so a direct anon query against public.products cannot see an unlaunched zakhnook_fulfilled product", () => {
  const policy = VIEW_MIGRATION.match(/create policy "Public can read published products"\s*\n\s*on public\.products for select[\s\S]*?;/i)![0];
  assert.match(policy, /to anon, authenticated/);
  assert.match(policy, /private\.is_product_storefront_launch_gated\(products\.brand_id, products\.first_stocked_at\)/);
  // The launch-gate helper itself is SECURITY DEFINER — otherwise an anon
  // session's own RLS view of brand_fulfillment_transitions (which has no
  // public read policy) would make the "no open transition" half of the
  // check vacuously true, defeating the exclusion for that session.
  const helper = VIEW_MIGRATION.match(/create or replace function private\.is_product_storefront_launch_gated\([\s\S]*?\n\$\$;/i)![0];
  assert.match(helper, /security definer/);
});

// ---------------------------------------------------------------------------
// 2. Open-transition storefront visibility
// ---------------------------------------------------------------------------

test("item 8 / open-transition visibility: both the RLS policy and storefront_products share the exact same launch-gate helper, so a brand mid-transition is excluded identically from direct table reads and view reads", () => {
  const helper = VIEW_MIGRATION.match(/create or replace function private\.is_product_storefront_launch_gated\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    helper,
    /and not exists \(\s*\n\s*select 1 from public\.brand_fulfillment_transitions bft\s*\n\s*where bft\.brand_id = p_brand_id\s*\n\s*and bft\.status not in \('completed', 'cancelled', 'failed'\)\s*\n\s*\);/
  );
  const policyUsesHelper = /private\.is_product_storefront_launch_gated\(products\.brand_id, products\.first_stocked_at\)/.test(VIEW_MIGRATION);
  const viewUsesHelper = /where private\.is_product_storefront_launch_gated\(p\.brand_id, p\.first_stocked_at\);/.test(VIEW_MIGRATION);
  assert.ok(policyUsesHelper && viewUsesHelper, "both the RLS policy and the view must call the same shared helper");
});

// ---------------------------------------------------------------------------
// 3. Card intention / transition race
// ---------------------------------------------------------------------------

const AUTH = { authenticated: true as const, userId: "33333333-3333-4333-8333-333333333333" };
const ENV = { secretKey: "sk_test_secret", integrationId: "5835485" };
const IDEMPOTENCY_KEY = "7ba7b810-9dad-41d1-80b4-00c04fd430c9";

const SHIPPING_SETTINGS: ShippingSettingsContent = {
  flatDeliveryFeeEgp: 50,
  freeShippingThresholdEgp: 1500,
  returnPolicyDays: 30,
};

function product(): ProductLookupRow {
  return {
    id: "prod-1",
    name: "Linen Shirt",
    brand_name: "Zakhnook Studio",
    brand_slug: "zakhnook-studio",
    price: 500,
    discount_percent: null,
    discount_ends_at: null,
    currency: "EGP",
    status: "published",
    publish_date: null,
    paused_by_brand: false,
    brands: { is_active: true, fulfillment_mode: "brand_fulfilled" },
    image: "https://example.com/linen-shirt.jpg",
    first_stocked_at: "2026-01-01T00:00:00.000Z",
  };
}

function variant(): ProductVariant {
  return {
    id: "variant-1",
    productId: "prod-1",
    sku: "SKU-1",
    quantity: 10,
    sellingStatus: "active",
    isArchived: false,
    optionValues: [
      { optionTypeId: "t-color", optionTypeName: "Color", optionValueId: "v-color", label: "Sand" },
      { optionTypeId: "t-size", optionTypeName: "Size", optionValueId: "v-size", label: "M" },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const validBody = {
  items: [{ productId: "prod-1", size: "M", color: "Sand", quantity: 2 }],
  shipping: {
    firstName: "Nour",
    lastName: "Ahmed",
    email: "nour@example.com",
    phone: "+20 100 000 0000",
    address: "10 Nile Street",
    city: "Cairo",
    governorate: "Cairo",
  },
};

function makeDeps(overrides: Partial<CreateIntentionDeps> = {}): CreateIntentionDeps {
  const createPaymentAttempt = async (input: CreatePaymentAttemptInput): Promise<CreatePaymentAttemptResult> => ({
    ok: true,
    paymentAttemptId: "attempt-1",
    specialReference: "mahaly_attempt-1",
    status: "created",
    replayed: false,
  });
  return {
    fetchProducts: async () => ({ ok: true as const, rows: [product()] }),
    fetchVariants: async () => new Map([["prod-1", [variant()]]]),
    fetchBrandFlags: async () => [{ slug: "zakhnook-studio", isMahalyPartner: false }],
    fetchOpenTransitionBrandSlugs: async () => [],
    fetchShippingSettings: async () => SHIPPING_SETTINGS,
    createPaymentAttempt,
    markIntentionCreated: async () => {},
    markIntentionFailed: async () => {},
    createIntention: async () => ({ clientSecret: "egy_csk_test_success", intentionId: "pi_1", paymobOrderId: 1 }),
    now: () => new Date("2026-08-11T00:00:00.000Z"),
    ...overrides,
  };
}

test("item 8 / card race (item 3, pre-emptive side): createPaymobIntentionForCart rejects outright when the cart's brand has an open fulfillment transition, before ever calling Paymob", async () => {
  let paymobCalled = false;
  const deps = makeDeps({
    fetchOpenTransitionBrandSlugs: async () => ["zakhnook-studio"],
    createIntention: async () => {
      paymobCalled = true;
      return { clientSecret: "egy_csk_test_success", intentionId: "pi_1", paymobOrderId: 1 };
    },
  });
  const outcome = await createPaymobIntentionForCart(validBody, AUTH, IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.equal(outcome.status, 400);
  assert.equal(paymobCalled, false, "Paymob must never be reached once an open transition is detected");
});

test("item 8 / card race (item 3, pre-emptive side): an empty openTransitionBrandSlugs list does not block a normal intention", async () => {
  let paymobCalled = false;
  const deps = makeDeps({
    fetchOpenTransitionBrandSlugs: async () => [],
    createIntention: async () => {
      paymobCalled = true;
      return { clientSecret: "egy_csk_test_success", intentionId: "pi_1", paymobOrderId: 1 };
    },
  });
  const outcome = await createPaymobIntentionForCart(validBody, AUTH, IDEMPOTENCY_KEY, ENV, deps);
  assert.equal(outcome.ok, true);
  assert.equal(paymobCalled, true);
});

test("item 8 / card race (item 3, in-flight side): compute_fulfillment_transition_blockers reports OPEN_PAYMENT_ATTEMPT_PENDING for a payment_attempts row in a nonterminal status whose cart_snapshot references the brand, for BOTH transition directions", () => {
  const fn = MODE_MIGRATION.match(/create or replace function private\.compute_fulfillment_transition_blockers\([\s\S]*?\$\$;/i)![0];
  assert.match(fn, /where pa\.status in \('created', 'pending', 'paid', 'reflecting'\)/);
  assert.match(fn, /where item ->> 'brandSlug' = v_brand_slug/);
  assert.match(fn, /if v_open_payment_attempts > 0 then\s*\n\s*v_blockers := v_blockers \|\| jsonb_build_array\('OPEN_PAYMENT_ATTEMPT_PENDING'\);/);
  // This check runs before the if/else direction branch, so it applies
  // regardless of which way p_to_mode is switching.
  const checkIndex = fn.indexOf("if v_open_payment_attempts > 0 then");
  const directionBranchIndex = fn.indexOf("if p_to_mode = 'zakhnook_fulfilled' then");
  assert.ok(checkIndex !== -1 && directionBranchIndex !== -1 && checkIndex < directionBranchIndex);
});

test("item 8 / card race (item 3, last resort): place_order and place_paid_order raise a distinct FULFILLMENT_TRANSITION_BLOCKS_ORDER exception (not the generic INSUFFICIENT_STOCK) when a brand's transition opened between intention creation and payment completion", () => {
  const sql = compact(PERMISSIONS_MIGRATION);
  assert.ok(sql.includes("createorreplacefunctionprivate.is_brand_fulfillment_transition_open(p_brand_slugtext)"));
  const occurrences = PERMISSIONS_MIGRATION.match(/raise exception 'FULFILLMENT_TRANSITION_BLOCKS_ORDER: %', v_item ->> 'name';/g) ?? [];
  assert.equal(occurrences.length, 2, "expected the distinct exception in both place_order and place_paid_order");
  const guardCalls = PERMISSIONS_MIGRATION.match(/if private\.is_brand_fulfillment_transition_open\(v_brand_slug\) then/g) ?? [];
  assert.equal(guardCalls.length, 2);
});

// ---------------------------------------------------------------------------
// 4. Both cancellation directions
// ---------------------------------------------------------------------------

test("item 8 / cancellation direction — brand_fulfilled -> zakhnook_fulfilled: cancelling reverts un-shipped brand_stock_quantity back onto sellable quantity", () => {
  const fn = MODE_MIGRATION.match(/create or replace function public\.cancel_fulfillment_transition\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if v_transition\.to_mode = 'zakhnook_fulfilled' then/);
  assert.match(fn, /set quantity = quantity \+ brand_stock_quantity, brand_stock_quantity = 0, updated_at = now\(\)/);
});

test("item 8 / cancellation direction — zakhnook_fulfilled -> brand_fulfilled: cancelling NEVER moves brand_stock_quantity into sellable quantity, since the brand remains zakhnook_fulfilled and any brand_stock_quantity present is unrelated ordinary consignment bookkeeping", () => {
  const fn = MODE_MIGRATION.match(/create or replace function public\.cancel_fulfillment_transition\([\s\S]*?\n\$\$;/i)![0];
  const zakhnookBranch = fn.slice(fn.indexOf("if v_transition.to_mode = 'zakhnook_fulfilled' then"));
  const stockUpdateInBranch = zakhnookBranch.indexOf("set quantity = quantity + brand_stock_quantity, brand_stock_quantity = 0");
  const branchEndIndex = zakhnookBranch.indexOf("end if;\n  -- to_mode = 'brand_fulfilled'");
  assert.ok(stockUpdateInBranch !== -1 && branchEndIndex !== -1 && stockUpdateInBranch < branchEndIndex, "the stock reversal must be inside the zakhnook_fulfilled branch only");
  assert.match(fn, /-- to_mode = 'brand_fulfilled': deliberately no stock movement at all/);
});

// ---------------------------------------------------------------------------
// 5. Cancellation with open documents
// ---------------------------------------------------------------------------

test("item 8 / cancellation with open documents: cancel_fulfillment_transition auto-cancels every linked document still in draft/pending/submitted/approved, but blocks outright once any linked document is in_transit/receiving or already received/partially_received", () => {
  const fn = MODE_MIGRATION.match(/create or replace function public\.cancel_fulfillment_transition\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /where related_fulfillment_transition_id = p_transition_id\s*\n\s*and status in \('received', 'partially_received'\);/
  );
  assert.match(fn, /raise exception 'FULFILLMENT_TRANSITION_CANNOT_CANCEL_STOCK_ALREADY_RECEIVED';/);
  assert.match(
    fn,
    /where related_fulfillment_transition_id = p_transition_id\s*\n\s*and status in \('in_transit', 'receiving'\);/
  );
  assert.match(fn, /raise exception 'FULFILLMENT_TRANSITION_CANNOT_CANCEL_DOCUMENT_IN_TRANSIT';/);
  assert.match(
    fn,
    /where related_fulfillment_transition_id = p_transition_id\s*\n\s*and status in \('draft', 'pending', 'submitted', 'approved'\)/
  );
  assert.match(fn, /perform public\.cancel_warehouse_document\(v_doc\.id, p_actor_id, 'Auto-cancelled: fulfillment transition cancelled'\);/);
});

test("item 8 / cancellation with open documents: request_warehouse_return links its document to any open zakhnook_fulfilled->brand_fulfilled transition, so cancel_fulfillment_transition's open-document checks can actually find it", () => {
  const fn = DOCS_MIGRATION.match(/create or replace function public\.request_warehouse_return\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /select id into v_open_transition_id\s*\n\s*from public\.brand_fulfillment_transitions\s*\n\s*where brand_id = p_brand_id and to_mode = 'brand_fulfilled'\s*\n\s*and status not in \('completed', 'cancelled', 'failed'\)\s*\n\s*limit 1;/
  );
  assert.match(fn, /related_fulfillment_transition_id\s*\n\s*\) values \(/);
  assert.match(fn, /'to_brand', now\(\), p_items, v_document_number, 'stock_return_note',\s*\n\s*v_open_transition_id/);
});

test("item 8 / reverse-direction request block: request_warehouse_transfer refuses a new inbound Stock Transfer Note while a zakhnook_fulfilled -> brand_fulfilled transition is open, even though is_mahaly_partner is still true", () => {
  const fn = DOCS_MIGRATION.match(/create or replace function public\.request_warehouse_transfer\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /if exists \(\s*\n\s*select 1 from public\.brand_fulfillment_transitions\s*\n\s*where brand_id = p_brand_id and to_mode = 'brand_fulfilled'\s*\n\s*and status not in \('completed', 'cancelled', 'failed'\)\s*\n\s*\) then\s*\n\s*raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS/
  );
  // This block must be checked BEFORE the is_mahaly_partner-based
  // BRAND_NOT_PARTNER gate, since an is_mahaly_partner=true brand would
  // otherwise sail straight through that gate during the exact window
  // this corrective item targets.
  const blockIndex = fn.indexOf("raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS");
  const partnerGateIndex = fn.indexOf("raise exception 'BRAND_NOT_PARTNER';");
  assert.ok(blockIndex !== -1 && partnerGateIndex !== -1 && blockIndex < partnerGateIndex);
});

// ---------------------------------------------------------------------------
// 6. Missing-only quarantine
// ---------------------------------------------------------------------------

test("item 8 / missing-only quarantine: receive_warehouse_document_canonical creates the quarantine hold movement when damaged_qty > 0 OR missing_qty > 0 (not damaged-only) — in both live definitions of the function", () => {
  for (const migration of [DOCS_MIGRATION, PRODUCT_LAUNCH_MIGRATION]) {
    const fn = migration.match(/create or replace function private\.receive_warehouse_document_canonical\([\s\S]*?\n\$\$;/i)![0];
    assert.match(fn, /if v_damaged > 0 or v_missing > 0 then\s*\n/);
    assert.doesNotMatch(fn, /if v_damaged > 0 then\s*\n\s*insert into public\.inventory_movements/);
  }
});

// ---------------------------------------------------------------------------
// 7. Quarantine idempotency conflicts
// ---------------------------------------------------------------------------

test("item 8 / quarantine idempotency: a replay for the same transfer item AND resolution returns replayed:true; reuse against another item or another resolution raises IDEMPOTENCY_CONFLICT, checked before QUARANTINE_ALREADY_RESOLVED", () => {
  const fn = DOCS_MIGRATION.match(/create or replace function public\.resolve_warehouse_quarantine\([\s\S]*?\n\$\$;/i)![0];

  const replaySuccessIndex = fn.indexOf(
    "if v_existing_movement.related_entity_id = p_transfer_item_id and v_item.quarantine_resolution = p_resolution then"
  );
  assert.ok(replaySuccessIndex !== -1, "expected the precise item+resolution replay-success branch");

  const conflictSection = fn.slice(replaySuccessIndex);
  assert.match(conflictSection, /raise exception 'IDEMPOTENCY_CONFLICT';/);

  const conflictIndex = fn.indexOf("raise exception 'IDEMPOTENCY_CONFLICT';");
  const alreadyResolvedIndex = fn.indexOf("if v_item.quarantine_resolved_at is not null then raise exception 'QUARANTINE_ALREADY_RESOLVED'; end if;");
  assert.ok(conflictIndex !== -1 && alreadyResolvedIndex !== -1 && conflictIndex < alreadyResolvedIndex);

  assert.match(fn, /if nullif\(pg_catalog\.btrim\(p_note\), ''\) is null then\s*\n\s*raise exception 'QUARANTINE_RESOLUTION_NOTE_REQUIRED';\s*\n\s*end if;/);
});

test("item 8 / quarantine resolve route: a properly authenticated admin/warehouse-receiver API route calls resolve_warehouse_quarantine — no route called this RPC before this pass", () => {
  const route = read("app/api/admin/warehouse/quarantine/resolve/route.ts");
  assert.match(route, /requireWarehouseReceiver\(\)/);
  assert.match(route, /\.rpc\("resolve_warehouse_quarantine"/);
  assert.match(route, /idempotency-key/i);
  assert.match(route, /body\.note\?\.trim\(\)/);
  assert.ok(DOCS_SQL.includes("revokeallonfunctionpublic.resolve_warehouse_quarantine(uuid,uuid,text,text,text)frompublic,anon,authenticated;"));
});
