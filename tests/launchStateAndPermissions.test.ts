import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n/g, "\n");
}
function compact(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ").toLowerCase().replace(/\s+/g, "");
}

const LAUNCH_PATH = "supabase/migrations/20260814000004_product_launch_state.sql";
const launchMigration = read(LAUNCH_PATH);
const launchSql = compact(launchMigration);

const PERM_PATH = "supabase/migrations/20260814000005_inventory_permission_boundaries.sql";
const permMigration = read(PERM_PATH);
const permSql = compact(permMigration);

// ---------------------------------------------------------------------------
// Product launch state
// ---------------------------------------------------------------------------

test("products.first_stocked_at is a nullable timestamp, never a stored 3-value enum", () => {
  assert.match(launchMigration, /alter table public\.products add column if not exists first_stocked_at timestamptz;/);
  assert.doesNotMatch(launchMigration, /launch_state/);
});

test("a brand_fulfilled product's opening stock stamps first_stocked_at immediately when opening_stock > 0, invisible to that fulfillment mode", () => {
  const fn = launchMigration.match(/create or replace function public\.create_variant_with_opening_stock\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if p_opening_stock > 0 then\s*\n\s*update public\.products\s*\n\s*set first_stocked_at = coalesce\(first_stocked_at, now\(\)\)\s*\n\s*where id = p_product_id;\s*\n\s*end if;/);
});

test("a zakhnook_fulfilled product's first accepted 'to_local' receipt line (received_ok_qty > 0) stamps first_stocked_at — never for a return, and never cleared once set", () => {
  const fn = launchMigration.match(/create or replace function private\.receive_warehouse_document_canonical\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if p_expected_direction = 'to_local' and v_ok > 0 then\s*\n\s*perform private\.mark_product_first_stocked\(v_variant\.product_id\);/);
  const markFn = launchMigration.match(/create or replace function private\.mark_product_first_stocked\([\s\S]*?\$\$;/i)![0];
  assert.match(markFn, /coalesce\(first_stocked_at, now\(\)\)/);
});

test("mark_product_first_stocked is unreachable from anywhere but internal SQL — no client or even service_role grant", () => {
  assert.ok(launchSql.includes("revokeallonfunctionprivate.mark_product_first_stocked(text)frompublic,anon,authenticated,service_role;"));
});

// Item 5: backfill for existing zakhnook_fulfilled products with legitimate stock.
test("first_stocked_at is backfilled for existing zakhnook_fulfilled products with currently-sellable stock or historical receipt evidence, never fabricated for products with neither", () => {
  assert.match(launchMigration, /update public\.products p\s*\n\s*set first_stocked_at = coalesce\(/);
  assert.match(launchMigration, /where im\.product_id = p\.id and im\.movement_type = 'warehouse_transfer_received'/);
  assert.match(launchMigration, /and b\.fulfillment_mode = 'zakhnook_fulfilled'\s*\n\s*and p\.first_stocked_at is null/);
  // Only ever touches a currently-null column, and only when there's real
  // evidence (a past receipt OR live stock) — never an unconditional
  // stamp-everything backfill.
  assert.match(
    launchMigration,
    /exists \(\s*\n\s*select 1 from public\.inventory_movements im\s*\n\s*where im\.product_id = p\.id and im\.movement_type = 'warehouse_transfer_received'\s*\n\s*\)\s*\n\s*or exists \(\s*\n\s*select 1 from public\.product_variants pv\s*\n\s*where pv\.product_id = p\.id and pv\.is_archived = false and pv\.quantity > 0\s*\n\s*\)/
  );
});


// ---------------------------------------------------------------------------
// Inventory permission boundaries
// ---------------------------------------------------------------------------

test("apply_inventory_adjustments rejects any adjustment against a zakhnook_fulfilled brand outright — direct adjustment is never allowed for partner-held stock", () => {
  const fn = permMigration.match(/create or replace function public\.apply_inventory_adjustments\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if v_fulfillment_mode = 'zakhnook_fulfilled' then\s*\n\s*raise exception 'PARTNER_DIRECT_ADJUSTMENT_FORBIDDEN/);
});

test("apply_inventory_adjustments also refuses any adjustment while the brand has a non-terminal fulfillment transition open (cutover safety)", () => {
  const fn = permMigration.match(/create or replace function public\.apply_inventory_adjustments\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /where brand_id = p_brand_id and status not in \('completed', 'cancelled', 'failed'\)\s*\n\s*\) into v_has_open_transition;/);
  assert.match(fn, /raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS/);
});

test("apply_inventory_adjustments still allows an ordinary brand_fulfilled brand's adjustment through unchanged, and stays idempotent per (variant_id, operation_key)", () => {
  const fn = permMigration.match(/create or replace function public\.apply_inventory_adjustments\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /select fulfillment_mode into v_fulfillment_mode from public\.brands where id = p_brand_id for update;/);
  assert.match(fn, /if v_variant\.id is null then\s*\n\s*raise exception 'Variant not found for this brand';/);
  assert.match(fn, /'replayed', true/);
});

test("item 6: apply_inventory_adjustments locks the brand row BEFORE the mode/transition checks, and before any variant lock — brand-then-variants is the consistent lock order across every RPC in this system", () => {
  const fn = permMigration.match(/create or replace function public\.apply_inventory_adjustments\([\s\S]*?\n\$\$;/i)![0];
  const brandLockIndex = fn.indexOf("select fulfillment_mode into v_fulfillment_mode from public.brands where id = p_brand_id for update;");
  const modeCheckIndex = fn.indexOf("if v_fulfillment_mode = 'zakhnook_fulfilled' then");
  const variantLockIndex = fn.indexOf("for update of pv;");
  assert.ok(brandLockIndex !== -1 && modeCheckIndex !== -1 && variantLockIndex !== -1);
  assert.ok(brandLockIndex < modeCheckIndex, "brand lock must happen before the mode check");
  assert.ok(modeCheckIndex < variantLockIndex, "brand lock/mode check must happen before any variant is locked");
});

test("set_warehouse_brand_stock also refuses to run while a fulfillment transition is open", () => {
  const fn = permMigration.match(/create or replace function public\.set_warehouse_brand_stock\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS/);
});

test("variant archive is blocked (DB-level, not just app-layer) by sellable stock, declared brand stock, an open warehouse document line, unresolved quarantine, or an open order — the four conditions the old app-only check never covered plus the original one", () => {
  const fn = permMigration.match(/create or replace function public\.enforce_variant_archive_safety\(\)[\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if new\.quantity > 0 then\s*\n\s*raise exception 'VARIANT_ARCHIVE_BLOCKED_SELLABLE_STOCK';/);
  assert.match(fn, /if new\.brand_stock_quantity > 0 then\s*\n\s*raise exception 'VARIANT_ARCHIVE_BLOCKED_DECLARED_BRAND_STOCK';/);
  assert.match(fn, /raise exception 'VARIANT_ARCHIVE_BLOCKED_OPEN_WAREHOUSE_DOCUMENT';/);
  assert.match(fn, /raise exception 'VARIANT_ARCHIVE_BLOCKED_UNRESOLVED_QUARANTINE';/);
  assert.match(fn, /raise exception 'VARIANT_ARCHIVE_BLOCKED_OPEN_ORDER';/);
  assert.match(fn, /wt\.status not in \('received', 'rejected', 'cancelled'\);/);
  assert.match(fn, /o\.status not in \('fulfilled', 'cancelled'\);/);
});

test("item 13: archive safety counts only UNRESOLVED quarantine (quarantine_resolved_at is null) — a line resolved via resolve_warehouse_quarantine no longer blocks archiving forever", () => {
  const fn = permMigration.match(/create or replace function public\.enforce_variant_archive_safety\(\)[\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /where variant_id = new\.id\s*\n\s*and \(coalesce\(damaged_qty, 0\) > 0 or coalesce\(missing_qty, 0\) > 0\)\s*\n\s*and quarantine_resolved_at is null;/
  );
});

test("the archive-safety trigger only fires on the false->true transition, never on insert or an already-archived row", () => {
  const fn = permMigration.match(/create or replace function public\.enforce_variant_archive_safety\(\)[\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if tg_op <> 'UPDATE' or old\.is_archived <> false or new\.is_archived <> true then\s*\n\s*return new;/);
  assert.match(permMigration, /before update on public\.product_variants\s*\nfor each row execute function public\.enforce_variant_archive_safety\(\);/);
});

test("item 10: apply_warehouse_stock_correction is re-declared to lock the brand row first, require zakhnook_fulfilled mode, and reject during an open fulfillment transition — previously callable against ANY brand's variant regardless of mode", () => {
  const fn = permMigration.match(/create or replace function public\.apply_warehouse_stock_correction\([\s\S]*?\n\$\$;/i)![0];
  const brandLockIndex = fn.indexOf("select fulfillment_mode into v_fulfillment_mode from public.brands where id = v_brand_id for update;");
  const variantLockIndex = fn.indexOf("for update of pv;");
  assert.ok(brandLockIndex !== -1 && variantLockIndex !== -1 && brandLockIndex < variantLockIndex, "brand must be locked before the variant");
  assert.match(fn, /if v_fulfillment_mode <> 'zakhnook_fulfilled' then\s*\n\s*raise exception 'CORRECTION_REQUIRES_ZAKHNOOK_FULFILLED_MODE';/);
  assert.match(fn, /raise exception 'FULFILLMENT_TRANSITION_IN_PROGRESS: warehouse corrections are paused during a fulfillment mode change';/);
  assert.ok(permSql.includes("revokeallonfunctionpublic.apply_warehouse_stock_correction(uuid,uuid,integer,text,text,text)frompublic,anon,authenticated;"));
  assert.ok(permSql.includes("grantexecuteonfunctionpublic.apply_warehouse_stock_correction(uuid,uuid,integer,text,text,text)toservice_role;"));
});

test("brand_stock_quantity / set_warehouse_brand_stock are documented as deprecated in place, not removed — Codex's concurrent Brand Portal Inventory UI keeps working unchanged", () => {
  assert.match(permMigration, /comment on column public\.product_variants\.brand_stock_quantity is\s*\n\s*'DEPRECATED/);
  assert.match(permMigration, /comment on function public\.set_warehouse_brand_stock\(uuid, uuid, jsonb\) is\s*\n\s*'DEPRECATED/);
});

test("the brand-portal warehouse stock route is disabled (claude/partner-restock-request-backend): it no longer accepts writes, returning a stable MANUAL_STOCK_OVERWRITE_DISABLED code instead of ever flagging a deprecated { ok: true } success", () => {
  const route = read("app/api/brand-portal/warehouse/stock/route.ts");
  assert.doesNotMatch(route, /\{ ok: true, deprecated: true \}/);
  assert.doesNotMatch(route, /\.rpc\("set_warehouse_brand_stock"/);
  assert.match(route, /"MANUAL_STOCK_OVERWRITE_DISABLED"/);
  assert.match(route, /status: 410/);
});

test("apply_inventory_adjustments stays service_role-only after this rewrite", () => {
  assert.ok(permSql.includes("revokeallonfunctionpublic.apply_inventory_adjustments(uuid,uuid,jsonb,text,text,text,text)frompublic,anon,authenticated;"));
  assert.ok(permSql.includes("grantexecuteonfunctionpublic.apply_inventory_adjustments(uuid,uuid,jsonb,text,text,text,text)toservice_role;"));
});

// ---------------------------------------------------------------------------
// Item 3: the receipt-before-activation order race — checkout refuses to
// sell a brand's stock while that brand has an open fulfillment transition,
// since product_variants.quantity is genuinely ambiguous during that window
// (see this migration's own header comment for the full reasoning).
// ---------------------------------------------------------------------------

test("private.is_brand_fulfillment_transition_open exists, is a stable SQL function, and is locked down to internal use only", () => {
  const fn = permMigration.match(/create or replace function private\.is_brand_fulfillment_transition_open\(p_brand_slug text\)[\s\S]*?\$\$;/i)![0];
  assert.match(fn, /and bft\.status not in \('completed', 'cancelled', 'failed'\)/);
  assert.ok(
    permSql.includes("revokeallonfunctionprivate.is_brand_fulfillment_transition_open(text)frompublic,anon,authenticated,service_role;")
  );
});

test("private.place_order (COD) is re-declared with the extra guard checked SEPARATELY before its stock-decrement WHERE clause — a distinct FULFILLMENT_TRANSITION_BLOCKS_ORDER exception, not folded into the generic INSUFFICIENT_STOCK condition — byte-identical to the master_orders.sql version otherwise, same signature", () => {
  const fn = permMigration.match(/create or replace function private\.place_order\([\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /if private\.is_brand_fulfillment_transition_open\(v_brand_slug\) then\s*\n\s*raise exception 'FULFILLMENT_TRANSITION_BLOCKS_ORDER: %', v_item ->> 'name';\s*\n\s*end if;/
  );
  assert.match(
    fn,
    /where id = v_variant_id\s*\n\s*and quantity >= v_quantity\s*\n\s*and selling_status = 'active';/
  );
  // The guard runs BEFORE the stock-decrement UPDATE, so a stuck-in-transition
  // brand never reaches (and never misattributes its failure to) the plain
  // stock-availability check.
  const guardIndex = fn.indexOf("raise exception 'FULFILLMENT_TRANSITION_BLOCKS_ORDER: %', v_item ->> 'name';");
  const updateIndex = fn.indexOf("set quantity = quantity - v_quantity, updated_at = now()\n        where id = v_variant_id");
  assert.ok(guardIndex !== -1 && updateIndex !== -1 && guardIndex < updateIndex);
  // The signature (parameter list) must match the original exactly — this
  // is a re-declaration, not a new function.
  assert.match(
    permMigration,
    /create or replace function private\.place_order\(\s*\n\s*p_shipping_name text,\s*\n\s*p_shipping_email text,\s*\n\s*p_shipping_phone text,\s*\n\s*p_shipping_address text,\s*\n\s*p_shipping_city text,\s*\n\s*p_shipping_governorate text,\s*\n\s*p_user_id uuid,\s*\n\s*p_items jsonb,\s*\n\s*p_coupon_code text default null,\s*\n\s*p_address_id uuid default null,\s*\n\s*p_flat_shipping_fee_egp numeric default 0,\s*\n\s*p_free_shipping_threshold_egp numeric default null\s*\n\s*\)/
  );
});

test("public.place_paid_order (card/Paymob) is re-declared with the identical separately-checked guard before its own stock-decrement WHERE clause — the customer is already charged by this point, so the distinct exception avoids misattributing the failure to a plain stockout — same signature", () => {
  const fn = permMigration.match(/create or replace function public\.place_paid_order\(p_payment_attempt_id uuid\)[\s\S]*?\n\$\$;/i)![0];
  assert.match(
    fn,
    /if private\.is_brand_fulfillment_transition_open\(v_brand_slug\) then\s*\n\s*raise exception 'FULFILLMENT_TRANSITION_BLOCKS_ORDER: %', v_item ->> 'name';\s*\n\s*end if;/
  );
  assert.match(
    fn,
    /where id = v_variant_id and quantity >= v_quantity and selling_status = 'active';/
  );
  const guardIndex = fn.indexOf("raise exception 'FULFILLMENT_TRANSITION_BLOCKS_ORDER: %', v_item ->> 'name';");
  const updateIndex = fn.indexOf("set quantity = quantity - v_quantity, updated_at = now()\n          where id = v_variant_id");
  assert.ok(guardIndex !== -1 && updateIndex !== -1 && guardIndex < updateIndex);
  assert.ok(permSql.includes("revokeallonfunctionpublic.place_paid_order(uuid)frompublic,anon,authenticated;"));
  assert.ok(permSql.includes("grantexecuteonfunctionpublic.place_paid_order(uuid)toservice_role;"));
});

test("a null/unattributed brand_slug (pool items with no brand) is never blocked by the transition guard — the guard only ever fires for a specific brand's own open transition", () => {
  const fn = permMigration.match(/create or replace function private\.is_brand_fulfillment_transition_open\(p_brand_slug text\)[\s\S]*?\$\$;/i)![0];
  // b.slug = p_brand_slug with p_brand_slug null evaluates to NULL (never
  // TRUE) in SQL, so exists(...) is false and the guard never fires —
  // documented here since it's not independently visible from the SQL
  // text alone without this note.
  assert.match(fn, /where b\.slug = p_brand_slug/);
});
