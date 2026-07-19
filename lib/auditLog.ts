import { supabaseAdmin } from "@/lib/supabase/admin";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "bulk_archive"
  | "bulk_publish"
  | "bulk_delete"
  | "restock"
  | "role_change";

export type AuditEntityType =
  | "product"
  | "brand"
  | "order"
  | "application"
  | "profile"
  | "coupon"
  | "site_content";

// Mirrors notify()'s fire-and-forget contract exactly — recording an audit
// entry is supplementary to the real write it's attached to, so a failure
// here is logged, never thrown, and never blocks that write.
export async function logAudit(entry: {
  actorId: string | null;
  actorLabel: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    actor_id: entry.actorId,
    actor_label: entry.actorLabel,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    before_value: entry.before ?? null,
    after_value: entry.after ?? null,
  });
  if (error) {
    console.error(`logAudit(${entry.entityType}/${entry.action}) failed:`, error.message);
  }
}
