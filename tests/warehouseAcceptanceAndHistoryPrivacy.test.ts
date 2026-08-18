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
  const migration = read("supabase/migrations/20260818195105_warehouse_request_acceptance_gate.sql");
  const receiveRoute = read("app/api/admin/warehouse/transfers/[id]/receive/route.ts");
  const adminPage = read("app/admin/warehouse/[id]/page.tsx");

  assert.match(migration, /old\.status in \('pending', 'submitted'\)[\s\S]*?new\.status in \('in_transit', 'receiving', 'partially_received', 'received'\)/);
  assert.match(migration, /WAREHOUSE_DOCUMENT_ACCEPTANCE_REQUIRED/);
  assert.match(migration, /add column if not exists expected_arrival_at timestamptz/);
  assert.match(migration, /create or replace function public\.accept_warehouse_document/);
  assert.match(migration, /EXPECTED_ARRIVAL_REQUIRED/);
  assert.match(migration, /set status = 'approved',[\s\S]*?expected_arrival_at = p_expected_arrival_at/);
  assert.doesNotMatch(migration.match(/create or replace function public\.accept_warehouse_document\([\s\S]*?\n\$\$;/i)?.[0] ?? "", /product_variants|inventory_movements/);
  assert.match(receiveRoute, /new Set\(\["approved", "in_transit", "partially_received"\]\)/);
  assert.doesNotMatch(receiveRoute, /new Set\(\["pending", "submitted"/);
  assert.match(adminPage, /AcceptWarehouseRequestButton/);
  assert.match(adminPage, /Acceptance confirms that Zakhnook expects this delivery\. It does not add stock/);
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
  const adminPage = read("app/admin/warehouse/[id]/page.tsx");
  const brandPage = read("app/brand-portal/warehouse/[id]/page.tsx");

  assert.match(history, /actor\?\.isStaff \? "Zakhnook Staff Team"/);
  assert.match(history, /`@\$\{actor\.displayName\}`/);
  assert.match(history, /canReveal && actor\?\.email/);
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
