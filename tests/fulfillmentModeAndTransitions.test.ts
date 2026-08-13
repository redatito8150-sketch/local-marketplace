import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Static verification of the fulfillment-mode + transition-workflow
// migration and its route layer — same established pattern as
// tests/masterOrders.test.ts / tests/stage4WarehouseStorage.test.ts, since
// this is SQL/DB-coupled code with no live Postgres available here.

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function read(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}
function compact(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\r\n]*/g, " ").toLowerCase().replace(/\s+/g, "");
}

const MIGRATION_PATH = "supabase/migrations/20260814000002_fulfillment_mode.sql";
const migration = read(MIGRATION_PATH);
const sql = compact(migration);

test("brands.fulfillment_mode is added, backfilled from is_mahaly_partner, not null, and constrained to the two known modes", () => {
  assert.match(migration, /alter table public\.brands\s*\n\s*add column if not exists fulfillment_mode text;/);
  assert.match(
    migration,
    /update public\.brands\s*\nset fulfillment_mode = case when is_mahaly_partner then 'zakhnook_fulfilled' else 'brand_fulfilled' end/
  );
  assert.ok(sql.includes("altercolumnfulfillment_modesetnotnull"));
  assert.ok(
    sql.includes("check(fulfillment_modein('brand_fulfilled','zakhnook_fulfilled'))")
  );
});

test("is_mahaly_partner is kept in permanent lockstep with fulfillment_mode via a BEFORE INSERT OR UPDATE trigger", () => {
  const fn = migration.match(/create or replace function public\.sync_is_mahaly_partner_from_fulfillment_mode\(\)[\s\S]*?\$\$;/i)![0];
  assert.match(fn, /new\.is_mahaly_partner := \(new\.fulfillment_mode = 'zakhnook_fulfilled'\);/);
  assert.match(migration, /before insert or update on public\.brands\s*\nfor each row execute function public\.sync_is_mahaly_partner_from_fulfillment_mode\(\);/);
});

test("a direct UPDATE that changes fulfillment_mode is blocked outside the transition RPCs' session-local guard flag", () => {
  const fn = migration.match(/create or replace function public\.guard_fulfillment_mode_direct_update\(\)[\s\S]*?\$\$;/i)![0];
  assert.match(fn, /new\.fulfillment_mode is distinct from old\.fulfillment_mode/);
  assert.match(fn, /current_setting\('app\.fulfillment_transition_in_progress', true\)/);
  assert.match(fn, /raise exception 'FULFILLMENT_MODE_DIRECT_UPDATE_FORBIDDEN/);
});

test("brand_fulfillment_transitions carries every field the spec requires and allows exactly one open transition per brand", () => {
  const tableDef = migration.match(/create table public\.brand_fulfillment_transitions \([\s\S]*?\);/i)![0];
  for (const column of [
    "brand_id", "from_mode", "to_mode", "status", "requested_by", "requested_at",
    "effective_date", "processed_by", "processed_at", "stock_snapshot", "validation_blockers",
    "notes", "completed_at", "cancelled_at", "operation_key",
  ]) {
    assert.ok(tableDef.includes(column), `expected column ${column} on brand_fulfillment_transitions`);
  }
  for (const status of [
    "requested", "validating", "scheduled", "awaiting_stock_transfer",
    "ready_to_activate", "completed", "cancelled", "failed",
  ]) {
    assert.ok(tableDef.includes(status), `expected status value ${status}`);
  }
  assert.match(
    migration,
    /create unique index brand_fulfillment_transitions_one_open_per_brand_idx\s*\n\s*on public\.brand_fulfillment_transitions \(brand_id\)\s*\n\s*where status not in \('completed', 'cancelled', 'failed'\);/
  );
});

test("brand_fulfillment_transitions has RLS enabled with owner/staff/admin read access and no client write grants", () => {
  assert.ok(sql.includes("altertablepublic.brand_fulfillment_transitionsenablerowlevelsecurity"));
  assert.ok(sql.includes("b.owner_user_id=(selectauth.uid())"));
  assert.ok(sql.includes("bs.user_id=(selectauth.uid())"));
  assert.ok(sql.includes("p.is_admin"));
  assert.ok(sql.includes("revokeinsert,update,deleteonpublic.brand_fulfillment_transitionsfromanon,authenticated;"));
});

test("blocker computation is direction-aware: remaining brand stock/open inbound transfers block going partner; Zakhnook stock/any open document blocks leaving partner", () => {
  const fn = migration.match(/create or replace function private\.compute_fulfillment_transition_blockers\([\s\S]*?\$\$;/i)![0];
  assert.match(fn, /if p_to_mode = 'zakhnook_fulfilled' then/);
  assert.match(fn, /'REMAINING_STOCK_NOT_YET_TRANSFERRED'/);
  assert.match(fn, /'OPEN_INBOUND_TRANSFER_PENDING'/);
  assert.match(fn, /'ZAKHNOOK_STOCK_NOT_YET_RESOLVED'/);
  assert.match(fn, /'OPEN_WAREHOUSE_DOCUMENT_PENDING'/);
});

test("request_fulfillment_mode_transition locks the brand row BEFORE checking the operation_key (item 12) — the idempotency check can no longer run unlocked", () => {
  const fn = migration.match(/create or replace function public\.request_fulfillment_mode_transition\([\s\S]*?\n\$\$;/i)![0];
  const lockIndex = fn.indexOf("select fulfillment_mode into v_from_mode from public.brands where id = p_brand_id for update;");
  const idempotencyCheckIndex = fn.indexOf("select id, brand_id, to_mode into v_existing\n  from public.brand_fulfillment_transitions\n  where operation_key = p_operation_key;");
  assert.ok(lockIndex !== -1, "expected the brand lock statement");
  assert.ok(idempotencyCheckIndex !== -1, "expected the post-lock idempotency check");
  assert.ok(lockIndex < idempotencyCheckIndex, "brand lock must happen before the operation_key check");
});

test("request_fulfillment_mode_transition only treats an operation_key match as a safe replay when brand_id AND to_mode both match — any other match is an explicit IDEMPOTENCY_CONFLICT, never a silent replay (item 12)", () => {
  const fn = migration.match(/create or replace function public\.request_fulfillment_mode_transition\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if v_existing\.brand_id = p_brand_id and v_existing\.to_mode = p_to_mode then\s*\n\s*return jsonb_build_object\('transition_id', v_existing\.id, 'replayed', true\);\s*\n\s*end if;\s*\n\s*raise exception 'IDEMPOTENCY_CONFLICT';/);
  // Same match/conflict logic is repeated in the unique_violation race
  // handler — a concurrent insert loss must be re-validated identically,
  // never assumed safe just because *a* row now exists for that key.
  assert.match(fn, /exception when unique_violation then/);
  const raceHandler = fn.slice(fn.indexOf("exception when unique_violation then"));
  assert.match(raceHandler, /if v_existing\.id is not null and v_existing\.brand_id = p_brand_id and v_existing\.to_mode = p_to_mode then/);
  assert.match(raceHandler, /raise exception 'IDEMPOTENCY_CONFLICT';/);
});

test("request_fulfillment_mode_transition refuses a second open transition and atomically moves brand-held quantity into brand_stock_quantity so it stops being sellable", () => {
  const fn = migration.match(/create or replace function public\.request_fulfillment_mode_transition\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /raise exception 'FULFILLMENT_TRANSITION_ALREADY_OPEN';/);
  assert.match(fn, /brand_stock_quantity = brand_stock_quantity \+ v_original_quantity,\s*\n\s*quantity = 0,/);
  assert.match(fn, /order by pv\.id\s*\n\s*for update of pv/);
  assert.match(fn, /'brand_location', 'in_transit_to_zakhnook', 'fulfillment_transition', v_transition_id/);
});

test("item 2: the cutover ledger entry captures the original quantity from the locking cursor BEFORE the UPDATE zeroes it, never re-reading the row afterward", () => {
  const fn = migration.match(/create or replace function public\.request_fulfillment_mode_transition\([\s\S]*?\n\$\$;/i)![0];
  // The lock cursor selects quantity explicitly, and v_original_quantity is
  // assigned from it BEFORE the UPDATE statement — not derived from a
  // second read of product_variants after the row has already changed.
  assert.match(fn, /select pv\.id, pv\.quantity\s*\n\s*from public\.product_variants pv/);
  assert.match(fn, /v_original_quantity := v_lock\.quantity;/);
  const captureIndex = fn.indexOf("v_original_quantity := v_lock.quantity;");
  const updateIndex = fn.indexOf("set brand_stock_quantity = brand_stock_quantity + v_original_quantity");
  assert.ok(captureIndex !== -1 && updateIndex !== -1 && captureIndex < updateIndex);
  // The ledger insert uses v_original_quantity for previous_quantity and
  // -v_original_quantity for the delta — not a re-read of pv.quantity
  // (which would already be 0 by the time this statement runs).
  assert.match(fn, /select pv\.id, pv\.product_id, p_brand_id, v_original_quantity, -v_original_quantity, 0,/);
});

test("activate_fulfillment_mode_transition re-checks blockers under lock before flipping the mode, and reverts the guard-flag pattern correctly (sets the session flag immediately before, and only before, the one UPDATE that changes fulfillment_mode)", () => {
  const fn = migration.match(/create or replace function public\.activate_fulfillment_mode_transition\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /v_blockers := private\.compute_fulfillment_transition_blockers\(v_transition\.brand_id, v_transition\.to_mode\);/);
  assert.match(fn, /raise exception 'FULFILLMENT_TRANSITION_STILL_BLOCKED';/);
  assert.match(fn, /perform set_config\('app\.fulfillment_transition_in_progress', 'true', true\);\s*\n\s*update public\.brands\s*\n\s*set fulfillment_mode = v_transition\.to_mode/);
  // Only ONE update to brands.fulfillment_mode in this function body.
  const modeUpdates = fn.match(/update public\.brands\s*\n\s*set fulfillment_mode/g) ?? [];
  assert.equal(modeUpdates.length, 1);
});

test("activate_fulfillment_mode_transition (zakhnook->brand) moves residual brand_stock_quantity back into quantity, since that is the column brand_fulfilled storefront stock reads from", () => {
  const fn = migration.match(/create or replace function public\.activate_fulfillment_mode_transition\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /if v_transition\.to_mode = 'brand_fulfilled' then/);
  assert.match(fn, /quantity = quantity \+ brand_stock_quantity, brand_stock_quantity = 0/);
  assert.match(fn, /'returned_to_brand', 'brand_location', 'fulfillment_transition', p_transition_id/);
});

test("item 11: activation is refused before effective_date, rather than silently ignoring the scheduling request", () => {
  const fn = migration.match(/create or replace function public\.activate_fulfillment_mode_transition\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /select id, brand_id, from_mode, to_mode, status, effective_date into v_transition/);
  assert.match(fn, /if v_transition\.effective_date is not null and v_transition\.effective_date > now\(\) then\s*\n\s*raise exception 'EFFECTIVE_DATE_NOT_REACHED';/);
});

test("item 8: cancel_fulfillment_transition refuses to cancel once any of its own linked inbound documents has already delivered stock to Zakhnook (received/partially_received) — only resolvable via an auditable reverse transfer", () => {
  const fn = migration.match(/create or replace function public\.cancel_fulfillment_transition\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /select count\(\*\) into v_progressed_count\s*\n\s*from public\.warehouse_transfers\s*\n\s*where related_fulfillment_transition_id = p_transition_id\s*\n\s*and status in \('received', 'partially_received'\);/);
  assert.match(fn, /raise exception 'FULFILLMENT_TRANSITION_CANNOT_CANCEL_STOCK_ALREADY_RECEIVED';/);
  // The block check runs BEFORE the un-shipped-remainder reversal loop —
  // cancellation must not partially revert anything before confirming it's
  // actually safe to.
  const blockIndex = fn.indexOf("raise exception 'FULFILLMENT_TRANSITION_CANNOT_CANCEL_STOCK_ALREADY_RECEIVED';");
  const reversalIndex = fn.indexOf("quantity = quantity + brand_stock_quantity, brand_stock_quantity = 0");
  assert.ok(blockIndex !== -1 && reversalIndex !== -1 && blockIndex < reversalIndex);
});

test("cancel_fulfillment_transition reverts any un-shipped cutover snapshot back onto sellable quantity", () => {
  const fn = migration.match(/create or replace function public\.cancel_fulfillment_transition\([\s\S]*?\n\$\$;/i)![0];
  assert.match(fn, /quantity = quantity \+ brand_stock_quantity, brand_stock_quantity = 0/);
  assert.match(fn, /'in_transit_to_zakhnook', 'brand_location', 'fulfillment_transition', p_transition_id/);
  assert.match(fn, /status = 'cancelled', cancelled_at = now\(\)/);
});

test("warehouse_transfers.related_fulfillment_transition_id links a document back to the transition that caused it, for item 8's cancel-safety check", () => {
  assert.match(migration, /alter table public\.warehouse_transfers\s*\n\s*add column if not exists related_fulfillment_transition_id uuid\s*\n\s*references public\.brand_fulfillment_transitions\(id\) on delete set null;/);
});

test("all four transition RPCs are service_role-only, and the blocker helper is unreachable from anywhere but them", () => {
  for (const fn of [
    "request_fulfillment_mode_transition(uuid, text, uuid, text, timestamptz, text)",
    "revalidate_fulfillment_transition(uuid, uuid)",
    "activate_fulfillment_mode_transition(uuid, uuid)",
    "cancel_fulfillment_transition(uuid, uuid, text)",
  ]) {
    const name = fn.split("(")[0];
    assert.ok(sql.includes(`revokeallonfunctionpublic.${name.toLowerCase()}`), `expected revoke on ${name}`);
    assert.ok(sql.includes(`grantexecuteonfunctionpublic.${name.toLowerCase()}`) && sql.includes("toservice_role;"), `expected service_role grant on ${name}`);
  }
  assert.ok(
    sql.includes("revokeallonfunctionprivate.compute_fulfillment_transition_blockers(uuid,text)frompublic,anon,authenticated,service_role;")
  );
});

test("historical orders keep their placed-at-the-time fulfillment snapshot: orders.fulfillment_type is set once at place_order() and never rewritten by any later fulfillment_mode change in this migration", () => {
  assert.doesNotMatch(migration, /update (public\.)?orders\s+set\s+fulfillment_type/i);
  // Confirmed against the master-orders migration too, for completeness —
  // fulfillment_type is only ever set at INSERT time, never UPDATEd anywhere.
  const masterOrders = read("supabase/migrations/20260812000006_master_orders.sql");
  assert.doesNotMatch(masterOrders, /update (public\.)?orders\s+set\s+fulfillment_type/i);
});

// ---------------------------------------------------------------------------
// Route layer
// ---------------------------------------------------------------------------

test("the admin quick-toggle route routes isMahalyPartner through the transition workflow instead of a bare column PATCH", () => {
  const route = read("app/api/admin/brands/[slug]/quick-toggle/route.ts");
  assert.doesNotMatch(route, /FIELD_TO_COLUMN\s*=\s*{\s*\n\s*isActive: "is_active",\s*\n\s*isMahalyPartner:/);
  assert.match(route, /\.rpc\("request_fulfillment_mode_transition"/);
  assert.match(route, /\.rpc\("activate_fulfillment_mode_transition"/);
  assert.match(route, /status: 409/);
});

test("the new fulfillment-transition routes are admin-gated and call the matching RPCs", () => {
  const requestRoute = read("app/api/admin/brands/[slug]/fulfillment-transition/route.ts");
  assert.match(requestRoute, /requireAdminUser\(\)/);
  assert.match(requestRoute, /\.rpc\("request_fulfillment_mode_transition"/);
  assert.match(requestRoute, /idempotency-key/i);

  const revalidateRoute = read("app/api/admin/brands/[slug]/fulfillment-transition/[transitionId]/revalidate/route.ts");
  assert.match(revalidateRoute, /requireAdminUser\(\)/);
  assert.match(revalidateRoute, /\.rpc\("revalidate_fulfillment_transition"/);

  const activateRoute = read("app/api/admin/brands/[slug]/fulfillment-transition/[transitionId]/activate/route.ts");
  assert.match(activateRoute, /requireAdminUser\(\)/);
  assert.match(activateRoute, /\.rpc\("activate_fulfillment_mode_transition"/);

  const cancelRoute = read("app/api/admin/brands/[slug]/fulfillment-transition/[transitionId]/cancel/route.ts");
  assert.match(cancelRoute, /requireAdminUser\(\)/);
  assert.match(cancelRoute, /\.rpc\("cancel_fulfillment_transition"/);
});
