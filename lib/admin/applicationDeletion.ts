import { supabaseAdmin } from "@/lib/supabase/admin";

export interface DeleteApplicationResult {
  ok: boolean;
  code: string;
  message: string;
  before?: unknown;
  mediaJobsQueued?: number;
}

// Audit finding APP-01 (docs/audits/2026-08-20-production-security-
// correctness-reliability-audit-en.md): the whole delete — every child
// table, the parent row, and queueing each document's Storage path into
// storage_cleanup_jobs — now happens inside one Postgres transaction via
// admin_delete_brand_application (supabase/migrations/
// 20260820000001_production_audit_corrective_fixes.sql), instead of five
// unguarded sequential .delete() calls that could leave a partially
// destroyed application and always orphaned the private legal documents in
// Storage.
export async function deleteApplicationTransactionally(
  applicationId: string,
  actorId: string,
  reason: string
): Promise<DeleteApplicationResult> {
  const { data, error } = await supabaseAdmin.rpc("admin_delete_brand_application", {
    p_application_id: applicationId,
    p_actor_id: actorId,
    p_reason: reason,
  });
  if (error) throw new Error(`admin_delete_brand_application(${applicationId}) failed: ${error.message}`);
  return data as DeleteApplicationResult;
}
