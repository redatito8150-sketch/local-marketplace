import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendToDiscord, buildDiscordDescription, DISCORD_COLORS } from "@/lib/discord";
import { logError } from "@/lib/errorLog";
import { getEntityAdminUrl } from "@/lib/admin/entityLinks";
import type { AuditEntityType } from "@/lib/auditLog";

export type NotificationType =
  | "order_created"
  | "order_cancelled"
  | "order_preparing"
  | "order_ready_for_pickup"
  | "product_created"
  | "product_updated"
  | "product_published"
  | "product_archived"
  | "product_restored"
  | "product_draft_deleted"
  | "product_deleted"
  | "product_permanently_deleted"
  | "product_emergency_hidden"
  | "product_deletion_hold_applied"
  | "product_deletion_hold_released"
  | "brand_updated"
  | "brand_application_submitted"
  | "coupon_created"
  | "role_created"
  | "role_updated"
  | "role_deleted"
  | "role_assigned"
  | "role_unassigned"
  | "low_stock"
  | "image_upload_failed"
  | "storage_error"
  | "warehouse_transfer_requested"
  | "warehouse_transfer_received"
  | "warehouse_transfer_rejected";

// Green = something was added, red = something was removed, orange for
// everything else (edits, warnings).
const NOTIFICATION_TYPE_COLORS: Record<NotificationType, number> = {
  order_created: DISCORD_COLORS.green,
  order_preparing: DISCORD_COLORS.orange,
  order_ready_for_pickup: DISCORD_COLORS.orange,
  product_created: DISCORD_COLORS.green,
  product_published: DISCORD_COLORS.green,
  product_restored: DISCORD_COLORS.green,
  product_deletion_hold_released: DISCORD_COLORS.green,
  brand_application_submitted: DISCORD_COLORS.green,
  coupon_created: DISCORD_COLORS.green,
  role_created: DISCORD_COLORS.green,
  role_assigned: DISCORD_COLORS.green,
  warehouse_transfer_received: DISCORD_COLORS.green,
  product_updated: DISCORD_COLORS.orange,
  brand_updated: DISCORD_COLORS.orange,
  role_updated: DISCORD_COLORS.orange,
  low_stock: DISCORD_COLORS.orange,
  image_upload_failed: DISCORD_COLORS.orange,
  storage_error: DISCORD_COLORS.orange,
  warehouse_transfer_requested: DISCORD_COLORS.orange,
  product_deletion_hold_applied: DISCORD_COLORS.orange,
  order_cancelled: DISCORD_COLORS.red,
  product_archived: DISCORD_COLORS.red,
  product_draft_deleted: DISCORD_COLORS.red,
  product_deleted: DISCORD_COLORS.red,
  product_permanently_deleted: DISCORD_COLORS.red,
  product_emergency_hidden: DISCORD_COLORS.red,
  role_deleted: DISCORD_COLORS.red,
  role_unassigned: DISCORD_COLORS.red,
  warehouse_transfer_rejected: DISCORD_COLORS.red,
};

export interface NotifyOptions {
  // Also used to build a "go to this thing" link (lib/admin/entityLinks.ts)
  // wherever the notification is shown.
  relatedEntityType?: AuditEntityType;
  relatedEntityId?: string;
  // Purely a reference back to the audit_logs row for traceability (so the
  // admin can look up exactly what changed) — no Approve/Revert workflow
  // is attached to this anymore. Every notification is plain: the admin
  // reads what happened and acts elsewhere if they need to, same as any
  // other notification in the app.
  auditLogId?: string | null;
  // Discord embed formatting only — never affects the stored row.
  actorLabel?: string;
  entityId?: string;
  entityIdLabel?: string;
  meta?: { label: string; value: string }[];
  detailLabel?: string;
}

// Notifications are supplementary to the real write path they're attached
// to (an order, a product save, an application submission) — a failure to
// record one is logged, never thrown, so it can't take down the actual
// operation the admin cares about.
export async function notify(
  type: NotificationType,
  title: string,
  body: string = "",
  options?: NotifyOptions
): Promise<void> {
  const hasEntityRef = Boolean(options?.relatedEntityType && options?.relatedEntityId);

  const { error } = await supabaseAdmin.from("notifications").insert({
    type,
    title,
    body,
    related_entity_type: hasEntityRef ? options!.relatedEntityType : null,
    related_entity_id: hasEntityRef ? options!.relatedEntityId : null,
    audit_log_id: options?.auditLogId ?? null,
    resolution: "n/a",
  });
  if (error) {
    logError(`notify(${type}) failed`, error.message);
  }

  const meta = [...(options?.meta ?? [])];
  if (hasEntityRef) {
    meta.unshift({ label: options?.entityIdLabel ?? "ID", value: options!.relatedEntityId! });
  } else if (options?.entityId) {
    meta.unshift({ label: options.entityIdLabel ?? "ID", value: options.entityId });
  }
  if (options?.actorLabel) {
    meta.push({ label: "User", value: options.actorLabel });
  }

  // Mirrored to Discord regardless of the DB write's own outcome — the
  // `notifications` table only keeps the most recent 50 rows (a trigger
  // prunes the rest), so this is the actual permanent archive for anything
  // older than that, not just a convenience copy.
  const entityUrl = hasEntityRef ? getEntityAdminUrl(options!.relatedEntityType!, options!.relatedEntityId!) : null;
  await sendToDiscord("notifications", {
    description: buildDiscordDescription({
      headline: title,
      meta,
      detailLabel: options?.detailLabel,
      detailBody: body || undefined,
      link: entityUrl ? { label: "Open in admin", url: entityUrl } : undefined,
    }),
    color: NOTIFICATION_TYPE_COLORS[type],
  });
}

export interface NotifyUserOptions {
  relatedEntityType?: string;
  relatedEntityId?: string;
  deliveryKey?: string;
}

// Customer-facing sibling of notify() — writes to user_notifications
// (RLS-scoped to the recipient, see supabase/migrations/20260805000001_user_notifications.sql)
// instead of the admin-only `notifications` table. Never a replacement
// for an existing email — call this alongside sendEmail(), not instead
// of it, so the same event reaches both channels. Same never-throw
// contract as notify()/logAudit(): a failure to record is logged, never
// thrown, since it's supplementary to the write path it's attached to.
//
// CORRECTIVE PASS: return type changed from `Promise<void>` to `{ok,
// error?}`, same non-breaking rationale as sendEmail()'s identical change
// — every pre-existing caller ignores the return value already.
export async function notifyUser(
  userId: string,
  type: string,
  title: string,
  body: string = "",
  options?: NotifyUserOptions
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin.from("user_notifications").insert({
    user_id: userId,
    type,
    title,
    body,
    related_entity_type: options?.relatedEntityType ?? null,
    related_entity_id: options?.relatedEntityId ?? null,
    delivery_key: options?.deliveryKey ?? null,
  });
  if (error) {
    // A stable delivery key turns a crash-after-insert retry into success
    // without creating a second inbox notification.
    if (error.code === "23505" && options?.deliveryKey) return { ok: true };
    logError(`notifyUser(${type}) failed`, error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
