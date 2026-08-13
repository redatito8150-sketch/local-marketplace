import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
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

test("the storefront catalog query excludes an un-launched zakhnook_fulfilled product's listing, but never excludes a brand_fulfilled product", () => {
  const src = read("lib/data/products.ts");
  assert.match(src, /resolveZakhnookFulfilledBrandIds/);
  assert.match(src, /\.eq\("fulfillment_mode", "zakhnook_fulfilled"\)/);
  assert.match(src, /first_stocked_at\.not\.is\.null,brand_id\.not\.in\.\(\$\{unlaunchedBrandIds\.join\(","\)\}\)/);
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
  assert.match(fn, /select fulfillment_mode into v_fulfillment_mode from public\.brands where id = p_brand_id;/);
  assert.match(fn, /if v_variant\.id is null then\s*\n\s*raise exception 'Variant not found for this brand';/);
  assert.match(fn, /'replayed', true/);
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

test("the archive-safety trigger only fires on the false->true transition, never on insert or an already-archived row", () => {
  const fn = permMigration.match(/create or replace function public\.enforce_variant_archive_safety\(\)[\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if tg_op <> 'UPDATE' or old\.is_archived <> false or new\.is_archived <> true then\s*\n\s*return new;/);
  assert.match(permMigration, /before update on public\.product_variants\s*\nfor each row execute function public\.enforce_variant_archive_safety\(\);/);
});

test("brand_stock_quantity / set_warehouse_brand_stock are documented as deprecated in place, not removed — Codex's concurrent Brand Portal Inventory UI keeps working unchanged", () => {
  assert.match(permMigration, /comment on column public\.product_variants\.brand_stock_quantity is\s*\n\s*'DEPRECATED/);
  assert.match(permMigration, /comment on function public\.set_warehouse_brand_stock\(uuid, uuid, jsonb\) is\s*\n\s*'DEPRECATED/);
});

test("the brand-portal warehouse stock route flags its response as deprecated without changing its existing { ok: true } shape", () => {
  const route = read("app/api/brand-portal/warehouse/stock/route.ts");
  assert.match(route, /NextResponse\.json\(\{ ok: true, deprecated: true \}\);/);
});

test("apply_inventory_adjustments stays service_role-only after this rewrite", () => {
  assert.ok(permSql.includes("revokeallonfunctionpublic.apply_inventory_adjustments(uuid,uuid,jsonb,text,text,text,text)frompublic,anon,authenticated;"));
  assert.ok(permSql.includes("grantexecuteonfunctionpublic.apply_inventory_adjustments(uuid,uuid,jsonb,text,text,text,text)toservice_role;"));
});
