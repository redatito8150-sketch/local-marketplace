import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static assertions against supabase/migrations/
// 20260815000000_product_launch_policy_and_opening_stock.sql — same
// convention as tests/stage4WarehouseStorage.test.ts and
// tests/storefrontLaunchGateView.test.ts. These pin structural/security
// properties that don't require a live database to verify. Real behavioral
// coverage of the RPCs lives in tests/productLaunchPolicyIntegration.test.ts,
// skip-gated on a live migrated database.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationPath = "supabase/migrations/20260815000000_product_launch_policy_and_opening_stock.sql";
const migration = readFileSync(path.join(rootDir, migrationPath), "utf8");

function compact(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
    .toLowerCase()
    .replace(/\s+/g, "");
}

const sql = compact(migration);

function fn(name: string): string {
  const match = migration.match(new RegExp(`create or replace function ${name}[\\s\\S]*?\\n\\$\\$;`));
  assert.ok(match, `expected to find function ${name}`);
  return match![0];
}

test("no stray comment markers and balanced $$ function-body delimiters", () => {
  // The exact bug class caught in prior passes: a literal `*/`-forming
  // substring anywhere in the file (inside a comment, or inside a regex
  // pattern string) tricks compact()'s /\*...*\// stripper into eating
  // large chunks of the file, causing spurious failures unrelated to real
  // SQL correctness.
  assert.doesNotMatch(migration, /\/\*/);
  const dollarCount = (migration.match(/\$\$/g) ?? []).length;
  assert.equal(dollarCount % 2, 0, "expected an even number of $$ delimiters");
});

test("products.launch_policy is a strict two-value check constraint, defaulting to show_now", () => {
  assert.ok(sql.includes("altertablepublic.productsaddcolumnifnotexistslaunch_policytextnotnulldefault'show_now'"));
  assert.ok(sql.includes("altertablepublic.productsaddconstraintproducts_launch_policy_check"));
  assert.ok(sql.includes("check(launch_policyin('show_now','when_stocked'))"));
});

test("visibility and durable opening-stock recognition columns are additive", () => {
  assert.ok(sql.includes("altertablepublic.productsaddcolumnifnotexistsfirst_visible_attimestamptz"));
  assert.ok(sql.includes("altertablepublic.inventory_movementsaddcolumnifnotexistsis_opening_stockbooleannotnulldefaultfalse"));
  assert.ok(sql.includes("altertablepublic.product_variantsaddcolumnifnotexistsopening_stock_recognized_attimestamptz"));
  assert.ok(sql.includes("altertablepublic.product_variantsaddcolumnifnotexistsopening_stock_recognition_sourcetext"));
});

test("legacy positive stock is durably recognized without fabricating a movement", () => {
  assert.match(migration, /opening_stock_recognition_source = case[\s\S]*?'historical_movement'[\s\S]*?'legacy_positive_quantity'/);
  assert.match(migration, /and \(ep\.variant_id is not null or pv\.quantity > 0\);/);
  assert.doesNotMatch(migration, /insert into public\.inventory_movements[\s\S]{0,300}legacy_positive_quantity/);
});

test("launch_policy is backfilled to preserve the OLD fulfillment_mode-keyed gate exactly, for zakhnook_fulfilled brands only", () => {
  const backfill = migration.match(/update public\.products p\s*\nset launch_policy = 'when_stocked'[\s\S]*?where b\.id = p\.brand_id and b\.fulfillment_mode = 'zakhnook_fulfilled';/);
  assert.ok(backfill, "expected the launch_policy backfill to be scoped to zakhnook_fulfilled brands only");
});

test("first_visible_at backfill only ever sets a currently-null column on a product that is ALREADY visible under the new rule, never a future/fabricated date", () => {
  // CORRECTIVE PASS: the candidate date is now the LATER of publish-
  // eligibility time and (for when_stocked products only) first_stocked_at
  // — a when_stocked product could never have been visible before its
  // stock gate passed, so publish_date alone could produce an impossibly
  // early date. Still capped at now() either way.
  const backfill = migration.match(/update public\.products p\s*\nset first_visible_at = least\(\s*\n\s*now\(\),\s*\n\s*case\s*\n\s*when p\.launch_policy = 'when_stocked'\s*\n\s*then greatest\(coalesce\(p\.publish_date, p\.created_at\), p\.first_stocked_at\)\s*\n\s*else coalesce\(p\.publish_date, p\.created_at\)\s*\n\s*end\s*\n\)[\s\S]*?where p\.first_visible_at is null[\s\S]*?;/);
  assert.ok(backfill, "expected the first_visible_at backfill");
  const body = backfill![0];
  assert.match(body, /p\.status = 'published'/);
  assert.match(body, /coalesce\(p\.paused_by_brand, false\) = false/);
  assert.match(body, /p\.publish_date is null or p\.publish_date <= now\(\)/);
  assert.match(body, /b\.is_active = true/);
  assert.match(body, /p\.launch_policy = 'show_now'/);
  assert.match(body, /p\.launch_policy = 'when_stocked' and p\.first_stocked_at is not null/);
  assert.match(body, /bft\.status not in \('completed', 'cancelled', 'failed'\)/);
});

test("private.is_product_customer_visible is the single canonical predicate, checking every required condition, SECURITY DEFINER with a locked search_path", () => {
  const body = fn("private\\.is_product_customer_visible");
  assert.match(body, /p\.status = 'published'/);
  assert.match(body, /coalesce\(p\.paused_by_brand, false\) = false/);
  assert.match(body, /p\.publish_date is null or p\.publish_date <= now\(\)/);
  assert.match(body, /exists \(select 1 from public\.brands b where b\.id = p\.brand_id and b\.is_active = true\)/);
  assert.match(body, /p\.launch_policy = 'show_now'/);
  assert.match(body, /p\.launch_policy = 'when_stocked' and p\.first_stocked_at is not null/);
  assert.match(body, /not exists \(\s*\n\s*select 1 from public\.brand_fulfillment_transitions bft/);
  assert.match(body, /security definer/);
  assert.match(body, /set search_path = ''/);
  assert.ok(sql.includes("revokeallonfunctionprivate.is_product_customer_visible(text)frompublic"));
  assert.ok(sql.includes("grantexecuteonfunctionprivate.is_product_customer_visible(text)toanon,authenticated,service_role"));
});

test("public.is_product_customer_visible is a service_role-only wrapper (PostgREST cannot call a private.* function directly)", () => {
  const body = fn("public\\.is_product_customer_visible");
  assert.match(body, /select coalesce\(private\.is_product_customer_visible\(p_product_id\), false\);/);
  assert.ok(sql.includes("revokeallonfunctionpublic.is_product_customer_visible(text)frompublic,anon,authenticated"));
  assert.ok(sql.includes("grantexecuteonfunctionpublic.is_product_customer_visible(text)toservice_role"));
});

test("the products RLS policy and storefront_products view both reuse the one canonical predicate — no duplicated/scattered condition list", () => {
  const policy = migration.match(/create policy "Public can read published products"[\s\S]*?;/)![0];
  assert.match(policy, /using \(private\.is_product_customer_visible\(products\.id\)\)/);
  // Nothing else in the policy body — the whole rule lives in the function.
  assert.doesNotMatch(policy, /status = 'published'/);

  const view = migration.match(/create or replace view public\.storefront_products[\s\S]*?;\n\ngrant select/)![0];
  assert.match(view, /where private\.is_product_customer_visible\(p\.id\);/);
  assert.doesNotMatch(view, /where p\.status = 'published'/);
  assert.match(view, /p\.launch_policy, p\.first_visible_at/);
  assert.doesNotMatch(view, /select\s+p\.\*/i);
});

test("the order_items availability trigger reuses the same canonical predicate instead of its old narrower status/paused-only check", () => {
  const body = fn("private\\.enforce_order_item_product_available");
  assert.match(body, /if v_product_id is null and new\.variant_id is not null then/);
  assert.match(body, /select product_id into v_product_id from public\.product_variants where id = new\.variant_id/);
  assert.match(body, /not coalesce\(private\.is_product_customer_visible\(v_product_id\), false\)/);
  assert.match(body, /raise exception 'PRODUCT_NOT_AVAILABLE_FOR_ORDER'/);
  assert.ok(sql.includes("createtriggerorder_items_enforce_product_available"));
  assert.ok(sql.includes("beforeinsertonpublic.order_items"));
});

test("create_variant_with_opening_stock keeps its exact old signature but always inserts quantity 0 and creates no inventory_movements row", () => {
  const body = fn("public\\.create_variant_with_opening_stock");
  assert.match(body, /p_product_id text,\s*\n\s*p_sku text,\s*\n\s*p_combo_key text,\s*\n\s*p_opening_stock integer,/);
  assert.match(body, /p_product_id, p_sku, 0, p_variant_price, p_variant_discount_percent,/);
  assert.doesNotMatch(body, /p_opening_stock,\s*\n\s*p_low_stock_threshold_override/);
  assert.doesNotMatch(body, /insert into public\.inventory_movements/);
  assert.doesNotMatch(body, /first_stocked_at/);
});

test("apply_inventory_adjustments recognizes and tags a variant's first genuine positive-stock movement, then stamps product-level launch state", () => {
  const body = fn("public\\.apply_inventory_adjustments");
  assert.match(
    body,
    /v_is_opening_stock := v_variant\.quantity = 0\s*\n\s*and v_new_quantity > 0\s*\n\s*and v_variant\.opening_stock_recognized_at is null;/
  );
  assert.match(body, /opening_stock_recognized_at = case[\s\S]*?opening_stock_recognition_source = case/);
  assert.match(body, /'inventory_adjustment'/);
  assert.match(body, /is_opening_stock\s*\n\s*\) values \([\s\S]*?v_is_opening_stock\s*\n\s*\);/);
  assert.match(body, /if v_is_opening_stock then\s*\n\s*update public\.products\s*\n\s*set first_stocked_at = coalesce\(first_stocked_at, now\(\)\)/);
  assert.match(body, /perform private\.stamp_product_first_visible_if_eligible\(v_variant\.product_id\);/);
  // Every other property (lock order, idempotency-by-operation-key,
  // zakhnook_fulfilled rejection, open-transition rejection) is unchanged
  // from the prior canonical version.
  assert.match(body, /select fulfillment_mode into v_fulfillment_mode from public\.brands where id = p_brand_id for update;/);
  assert.match(body, /PARTNER_DIRECT_ADJUSTMENT_FORBIDDEN/);
  assert.match(body, /FULFILLMENT_TRANSITION_IN_PROGRESS/);
});

test("receive_warehouse_document_canonical restores the first_stocked_at stamp the prior migration's re-declaration had silently dropped, and adds the same is_opening_stock tagging", () => {
  const body = fn("private\\.receive_warehouse_document_canonical");
  assert.match(
    body,
    /v_is_opening_stock := p_expected_direction = 'to_local'\s*\n\s*and v_variant\.quantity = 0 and v_new_quantity > 0\s*\n\s*and v_variant\.opening_stock_recognized_at is null/
  );
  assert.match(body, /'warehouse_receipt'/);
  // The regression fix: a 'to_local' receipt with received_ok_qty > 0 must
  // stamp first_stocked_at again (this was dropped by
  // 20260814010500_partner_replenishment_request.sql's re-declaration).
  assert.match(
    body,
    /if p_expected_direction = 'to_local' and v_ok > 0 then\s*\n\s*update public\.products\s*\n\s*set first_stocked_at = coalesce\(first_stocked_at, now\(\)\)/
  );
  assert.match(body, /perform private\.stamp_product_first_visible_if_eligible\(v_variant\.product_id\);/);
  assert.doesNotMatch(body, /mark_product_first_stocked/);
  // Unchanged locking/reconciliation behavior from the prior canonical version.
  assert.match(body, /for update of pv/);
  assert.match(body, /TRANSFER_ITEM_NOT_RECONCILED/);
});

test("stamp_product_first_visible_if_eligible is idempotent and concurrency-safe: the UPDATE's own WHERE clause both locks the row and re-checks eligibility at that moment", () => {
  const body = fn("private\\.stamp_product_first_visible_if_eligible");
  assert.match(body, /update public\.products\s*\n\s*set first_visible_at = now\(\)\s*\n\s*where id = p_product_id\s*\n\s*and first_visible_at is null\s*\n\s*and private\.is_product_customer_visible\(p_product_id\);/);
  // The private function itself is never directly grantable to
  // service_role either — only its public.* wrapper below is callable from
  // outside this migration's own SQL (from a plpgsql `perform`, which
  // doesn't need a grant at all).
  assert.ok(sql.includes("revokeallonfunctionprivate.stamp_product_first_visible_if_eligible(text)frompublic,anon,authenticated,service_role"));

  const wrapper = fn("public\\.stamp_product_first_visible_if_eligible");
  assert.match(wrapper, /select private\.stamp_product_first_visible_if_eligible\(p_product_id\);/);
  assert.ok(sql.includes("revokeallonfunctionpublic.stamp_product_first_visible_if_eligible(text)frompublic,anon,authenticated"));
  assert.ok(sql.includes("grantexecuteonfunctionpublic.stamp_product_first_visible_if_eligible(text)toservice_role"));
});

test("execute_scheduled_product_visibility_activation claims a bounded batch with FOR UPDATE SKIP LOCKED and reuses the same canonical eligibility check per row", () => {
  const body = fn("private\\.execute_scheduled_product_visibility_activation");
  assert.match(body, /where first_visible_at is null\s*\n\s*and status = 'published'/);
  // CORRECTIVE PASS — starvation fix: the canonical eligibility check now
  // runs INSIDE the candidate query's own WHERE clause, before LIMIT/FOR
  // UPDATE SKIP LOCKED, not as a redundant in-loop `if` after the batch is
  // already fetched. The original in-loop check let a persistent block of
  // ineligible rows sorted early re-consume every batch forever, starving
  // any eligible row sorted after them — moving the check into WHERE means
  // only already-eligible rows are ever claimed.
  assert.match(body, /and private\.is_product_customer_visible\(id\)\s*\n\s*order by publish_date nulls first, created_at/);
  assert.match(body, /limit greatest\(1, least\(coalesce\(p_batch_size, 100\), 500\)\)\s*\n\s*for update skip locked/);
  assert.doesNotMatch(body, /if private\.is_product_customer_visible\(v_row\.id\) then/);
  assert.ok(sql.includes("revokeallonfunctionprivate.execute_scheduled_product_visibility_activation(integer)frompublic,anon,authenticated,service_role"));

  const wrapper = fn("public\\.execute_scheduled_product_visibility_activation");
  assert.match(wrapper, /select private\.execute_scheduled_product_visibility_activation\(p_batch_size\);/);
  assert.ok(sql.includes("grantexecuteonfunctionpublic.execute_scheduled_product_visibility_activation(integer)toservice_role"));
});

test("set_product_launch_policy_show_now verifies ownership, is idempotent, and only ever moves when_stocked -> show_now", () => {
  const body = fn("public\\.set_product_launch_policy_show_now");
  assert.match(body, /if p_brand_id is not null and v_product\.brand_id <> p_brand_id then/);
  assert.match(body, /'code', 'PRODUCT_NOT_OWNED'/);
  assert.match(body, /if v_product\.launch_policy = 'show_now' then\s*\n\s*return jsonb_build_object\('ok', true, 'code', 'ALREADY_SHOW_NOW'/);
  assert.match(body, /update public\.products set launch_policy = 'show_now' where id = p_product_id;/);
  assert.match(body, /perform private\.stamp_product_first_visible_if_eligible\(p_product_id\);/);
  assert.ok(sql.includes("revokeallonfunctionpublic.set_product_launch_policy_show_now(text,uuid,uuid,text)frompublic,anon,authenticated"));
  assert.ok(sql.includes("grantexecuteonfunctionpublic.set_product_launch_policy_show_now(text,uuid,uuid,text)toservice_role"));
});

test("every mutating/gating function in this migration is either security definer with a locked search_path, or a private helper never exposed to anon/authenticated", () => {
  const definerCount = (sql.match(/securitydefinersetsearch_path=(''|public,pg_temp)/g) ?? []).length;
  assert.ok(definerCount >= 8, `expected at least 8 security definer functions with a locked search_path, saw ${definerCount}`);
});

test("back-in-stock claims use SKIP LOCKED, return a fencing token, verify the variant atomically, and fence every acknowledgement", () => {
  const claim = fn("private\\.claim_back_in_stock_deliveries");
  assert.match(claim, /claim_token uuid/);
  assert.match(claim, /join public\.product_variants pv[\s\S]*?pv\.quantity > 0[\s\S]*?pv\.selling_status = 'active'/);
  assert.match(claim, /for update of s skip locked/);
  assert.match(claim, /s\.claim_token/);

  const channelAck = fn("public\\.mark_back_in_stock_delivery_channel_sent");
  assert.match(channelAck, /and claim_token = p_claim_token/);
  assert.match(channelAck, /and delivery_status = 'claimed'/);

  const failureAck = fn("public\\.mark_back_in_stock_delivery_failed");
  assert.match(failureAck, /claim_token = p_claim_token and delivery_status = 'claimed'/);
  assert.ok(sql.includes("back_in_stock_subscriptions_one_active_per_user_variant_idx"));
  assert.ok(sql.includes("wheredelivery_statusin('pending','claimed')"));
});

test("COD and card flows pre-lock rows deterministically, while paid fulfillment honors the already-accepted attempt", () => {
  const intentionLocks = fn("private\\.lock_and_verify_intention_cart_visibility");
  assert.match(intentionLocks, /order by b\.id/);
  assert.match(intentionLocks, /order by 1[\s\S]*?for update/);

  const codLocks = fn("private\\.lock_and_verify_cod_cart_visibility");
  assert.match(codLocks, /order by p\.brand_id/);
  assert.match(codLocks, /order by 1/);
  const cod = fn("private\\.place_order");
  assert.match(cod, /perform private\.lock_and_verify_cod_cart_visibility\(p_items\);/);

  const paid = fn("public\\.place_paid_order");
  assert.match(paid, /perform private\.lock_and_verify_intention_cart_visibility\(v_attempt\.cart_snapshot, false, false\);/);
  assert.match(paid, /set_config\('app\.paid_attempt_fulfillment_in_progress', 'on', true\)/);
  assert.doesNotMatch(paid, /if not coalesce\(private\.is_product_customer_visible\(v_item ->> 'productId'\)/);
});
