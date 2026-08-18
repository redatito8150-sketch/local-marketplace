import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compact = (value: string) => value.replace(/--[^\r\n]*/g, " ").replace(/\s+/g, " ").toLowerCase();

test("brand cancellation is atomic, ownership-scoped, requested-only and service-role-only", () => {
  const migration = read("supabase/migrations/20260818195105_warehouse_request_acceptance_gate.sql");
  const sql = compact(migration);
  const fn = migration.match(/create or replace function public\.cancel_own_requested_warehouse_document\([\s\S]*?\n\$\$;/i)?.[0] ?? "";

  assert.match(fn, /where id = p_transfer_id\s*\n\s*for update;/);
  assert.match(fn, /v_transfer\.brand_id <> p_brand_id or v_transfer\.direction <> 'to_local'/);
  assert.match(fn, /if v_transfer\.status <> 'pending' then/);
  assert.match(fn, /WAREHOUSE_DOCUMENT_CANCELLATION_LOCKED/);
  assert.doesNotMatch(fn, /product_variants|inventory_movements/);
  assert.ok(sql.includes("revoke all on function public.cancel_own_requested_warehouse_document(uuid, uuid, uuid, text) from public, anon, authenticated;"));
  assert.ok(sql.includes("grant execute on function public.cancel_own_requested_warehouse_document(uuid, uuid, uuid, text) to service_role;"));
});

test("the database and receive route both require acceptance before physical receipt", () => {
  const gateMigration = read("supabase/migrations/20260818195105_warehouse_request_acceptance_gate.sql");
  const ownerScheduleMigration = read("supabase/migrations/20260818202448_warehouse_owner_arrival_schedule.sql");
  const receiveRoute = read("app/api/admin/warehouse/transfers/[id]/receive/route.ts");
  const adminPage = read("app/admin/warehouse/[id]/page.tsx");
  const approveRoute = read("app/api/admin/warehouse/documents/[id]/approve/route.ts");
  const actions = read("components/warehouse/WarehouseDocumentLifecycleActions.tsx");

  assert.match(gateMigration, /add column if not exists expected_arrival_at timestamptz/);
  assert.match(ownerScheduleMigration, /old\.status in \('pending', 'submitted'\)[\s\S]*?new\.status in \('in_transit', 'receiving', 'partially_received', 'received'\)/);
  assert.match(ownerScheduleMigration, /WAREHOUSE_DOCUMENT_ACCEPTANCE_REQUIRED/);
  assert.match(ownerScheduleMigration, /create or replace function public\.accept_warehouse_document\(\s*p_transfer_id uuid,\s*p_actor_id uuid\s*\)/);
  const canonicalAccept = ownerScheduleMigration.match(/create or replace function public\.accept_warehouse_document\(\s*p_transfer_id uuid,\s*p_actor_id uuid\s*\)[\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.doesNotMatch(canonicalAccept, /p_expected_arrival_at|expected_arrival_at\s*=/);
  assert.doesNotMatch(canonicalAccept, /product_variants|inventory_movements/);
  assert.match(receiveRoute, /new Set\(\["approved", "in_transit", "partially_received"\]\)/);
  assert.doesNotMatch(receiveRoute, /new Set\(\["pending", "submitted"/);
  assert.match(adminPage, /AcceptWarehouseRequestButton/);
  assert.match(adminPage, /The brand has already chosen the expected arrival/);
  assert.doesNotMatch(approveRoute, /request\.json|p_expected_arrival_at/);
  assert.doesNotMatch(actions, /type="datetime-local"/);
  assert.match(actions, /Expected arrival chosen by brand/);
});

test("only a brand owner schedules arrival while creating an atomic restock request", () => {
  const migration = read("supabase/migrations/20260818202448_warehouse_owner_arrival_schedule.sql");
  const route = read("app/api/brand-portal/warehouse/transfers/route.ts");
  const inventory = read("components/brand-portal/InventoryManager.tsx");
  const page = read("app/brand-portal/stock/page.tsx");
  const sql = compact(migration);

  assert.match(route, /owner\.accessLevel !== "owner"/);
  assert.match(route, /expectedArrivalAt/);
  assert.match(route, /request_warehouse_transfer_with_arrival/);
  assert.match(inventory, /accessLevel === "owner"/);
  assert.match(inventory, /type="datetime-local"/);
  assert.match(inventory, /expectedArrivalAt: new Date\(restockExpectedArrival\)\.toISOString\(\)/);
  assert.match(page, /accessLevel=\{owner\.accessLevel\}/);
  assert.match(migration, /v_transfer_id := public\.request_warehouse_transfer/);
  assert.match(migration, /where id = v_transfer_id\s*\n\s*for update/);
  assert.match(migration, /v_transfer\.expected_arrival_at is distinct from p_expected_arrival_at/);
  assert.ok(sql.includes("revoke all on function public.request_warehouse_transfer_with_arrival(uuid, uuid, jsonb, text, text, timestamptz) from public, anon, authenticated;"));
  assert.ok(sql.includes("grant execute on function public.request_warehouse_transfer_with_arrival(uuid, uuid, jsonb, text, text, timestamptz) to service_role;"));
});

test("Brand Portal offers cancellation only while Requested and never while impersonating", () => {
  const page = read("app/brand-portal/warehouse/[id]/page.tsx");
  const route = read("app/api/brand-portal/warehouse/transfers/[id]/cancel/route.ts");

  assert.match(page, /transfer\.status === "pending" && owner\.accessLevel === "owner" && !owner\.isImpersonating/);
  assert.match(page, /Accepted · awaiting arrival/);
  assert.match(route, /requireActiveBrandOwner/);
  assert.match(route, /owner\.isImpersonating/);
  assert.match(route, /owner\.accessLevel !== "owner"/);
  assert.match(route, /cancel_own_requested_warehouse_document/);
});

test("history masks staff, exposes brand display names, and reveals email only to full Admin", () => {
  const history = read("components/warehouse/WarehouseDocumentHistory.tsx");
  const actorLabel = read("components/warehouse/WarehouseActorLabel.tsx");
  const data = read("lib/data/warehouse.ts");
  const adminPage = read("app/admin/warehouse/[id]/page.tsx");
  const brandPage = read("app/brand-portal/warehouse/[id]/page.tsx");

  assert.match(actorLabel, /actor\?\.isStaff \? "Zakhnook Staff Team"/);
  assert.match(actorLabel, /`@\$\{actor\.displayName\}`/);
  assert.match(actorLabel, /canReveal && actor\?\.email/);
  assert.match(actorLabel, /document\.addEventListener\("pointerdown", closeOnOutside\)/);
  assert.match(actorLabel, /rootRef\.current\?\.contains/);
  assert.match(actorLabel, /actor\.roleLabel/);
  assert.match(data, /Brand owner/);
  assert.match(data, /Brand assistant/);
  assert.match(data, /roleLabel: warehouseActorRoleLabel/);
  assert.match(adminPage, /requireStaffRole\("admin"\)/);
  assert.match(adminPage, /canRevealActorIdentity=\{Boolean\(fullAdmin\)\}/);
  assert.match(brandPage, /canRevealActorIdentity=\{false\}/);
  assert.match(brandPage, /publicCorrections/);
  assert.match(brandPage, /email: null/);
  assert.doesNotMatch(brandPage, /requestedByEmail|approvedByEmail|decidedByEmail/);
});

test("correction history is one concise linked event instead of duplicated wide details", () => {
  const history = read("components/warehouse/WarehouseDocumentHistory.tsx");
  const workspace = read("components/admin/warehouse/WarehouseCorrectionWorkspace.tsx");

  assert.match(history, /isCorrectionAudit\(log\)/);
  assert.match(history, /Correction requested/);
  assert.match(history, /Correction applied/);
  assert.match(history, /href=\{`#warehouse-correction-\$\{correction\.id\}`\}/);
  assert.doesNotMatch(history, /describeWarehouseCorrectionLine|Correction requested and applied/);
  assert.match(workspace, /id=\{`warehouse-correction-\$\{correction\.id\}`\}/);
});
