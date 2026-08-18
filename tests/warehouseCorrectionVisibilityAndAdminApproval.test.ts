import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Brand Portal exposes the same warehouse correction record as a read-only document", () => {
  const listPage = read("app/brand-portal/warehouse/page.tsx");
  const detailPage = read("app/brand-portal/warehouse/[id]/page.tsx");
  const experience = read("components/brand-portal/warehouse/WarehouseExperience.tsx");
  const workspace = read("components/admin/warehouse/WarehouseCorrectionWorkspace.tsx");

  assert.match(listPage, /BrandPicker destination="\/brand-portal\/warehouse"/);
  assert.match(listPage, /readOnly=\{owner\.isImpersonating\}/);
  assert.match(experience, /\/brand-portal\/warehouse\/\$\{transfer\.id\}/);
  assert.match(detailPage, /transfer\.brandId !== owner\.brandId/);
  assert.match(detailPage, /<WarehouseCorrectionWorkspace[\s\S]*?readOnly/);
  assert.match(detailPage, /<WarehouseDocumentHistory/);
  assert.match(workspace, /!readOnly && correction\.status === "pending_approval"/);
  assert.match(workspace, /!readOnly && canReverse/);
});

test("only the full Admin rank receives immediate atomic correction posting", () => {
  const route = read("app/api/admin/warehouse/corrections/route.ts");
  const approvalRoute = read("app/api/admin/warehouse/corrections/[id]/approve/route.ts");
  const migration = read("supabase/migrations/20260818011358_admin_auto_approve_warehouse_corrections.sql");
  const guardFix = read("supabase/migrations/20260818131120_fix_admin_correction_posting_guard.sql");
  const normalized = migration.replace(/\s+/g, " ").toLowerCase();

  assert.match(route, /requireStaffRole\("admin"\)/);
  assert.match(route, /request_and_post_warehouse_admin_correction/);
  assert.match(route, /request_warehouse_correction_v2/);
  assert.match(migration, /approval_mode in \('independent', 'admin_auto'\)/);
  assert.match(migration, /Match the posting functions' lock order: brand, transfer, correction/);
  assert.match(migration, /v_result := public\.approve_warehouse_correction_v2/);
  assert.match(migration, /set requested_by = p_actor_id,[\s\S]*?approval_mode = 'admin_auto'/);
  assert.ok(normalized.includes("set search_path = ''"));
  assert.ok(normalized.includes("revoke all on function public.request_and_post_warehouse_admin_correction(uuid, uuid, text, text, text, jsonb, text) from public, anon, authenticated;"));
  assert.ok(normalized.includes("grant execute on function public.request_and_post_warehouse_admin_correction(uuid, uuid, text, text, text, jsonb, text) to service_role;"));
  assert.match(approvalRoute, /requireStaffRole\("admin"\)/);
  assert.match(approvalRoute, /post_existing_warehouse_admin_correction/);
  assert.match(guardFix, /app\.warehouse_admin_auto_post_in_progress/);
  assert.match(guardFix, /FULL_ADMIN_REQUIRED/);
  assert.match(guardFix, /ADMIN_CAN_ONLY_AUTO_POST_OWN_CORRECTION/);
  assert.ok(guardFix.replace(/\s+/g, " ").toLowerCase().includes("revoke all on function public.post_existing_warehouse_admin_correction(uuid, uuid) from public, anon, authenticated;"));
  assert.ok(guardFix.replace(/\s+/g, " ").toLowerCase().includes("grant execute on function public.post_existing_warehouse_admin_correction(uuid, uuid) to service_role;"));
});

test("legacy quarantine resolution closes the canonical queue status without touching GRN documents", () => {
  const migration = read("supabase/migrations/20260818131835_sync_legacy_warehouse_reconciliation.sql");
  const normalized = migration.replace(/\s+/g, " ").toLowerCase();

  assert.match(migration, /sync_legacy_warehouse_transfer_reconciliation/);
  assert.match(migration, /after update of quarantine_resolved_at, quarantine_resolution/);
  assert.match(migration, /wt\.status = 'received'/);
  assert.match(migration, /not exists \([\s\S]*?public\.warehouse_receipts/);
  assert.match(migration, /quarantine_resolved_at is null or wti\.quarantine_resolution is null/);
  assert.ok(normalized.includes("set search_path = ''"));
  assert.ok(normalized.includes("revoke all on function private.sync_legacy_warehouse_transfer_reconciliation() from public, anon, authenticated;"));
});

test("correction details are shared while actor identity remains in Document history", () => {
  const workspace = read("components/admin/warehouse/WarehouseCorrectionWorkspace.tsx");
  const history = read("components/warehouse/WarehouseDocumentHistory.tsx");
  const data = read("lib/data/warehouse.ts");

  assert.match(workspace, /describeWarehouseCorrectionLine\(line, variantLabel\)/);
  assert.doesNotMatch(workspace, /requestedByLabel|approvedByLabel|rejectedByLabel/);
  assert.match(history, /Requested by \$\{correction\.requestedByLabel/);
  assert.match(history, /Approved by \$\{correction\.approvedByLabel/);
  assert.match(history, /Rejected by \$\{correction\.rejectedByLabel/);
  assert.match(data, /\.select\("id, full_name, email"\)/);
});
