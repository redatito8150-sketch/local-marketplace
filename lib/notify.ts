import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendToDiscord, buildDiscordDescription, DISCORD_COLORS } from "@/lib/discord";
import { logError } from "@/lib/errorLog";
import { getEntityAdminUrl } from "@/lib/admin/entityLinks";
import type { AuditEntityType } from "@/lib/auditLog";

export type NotificationType =
  | "order_created"
  | "order_cancelled"
  | "product_created"
  | "product_updated"
  | "product_published"
  | "product_archived"
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
  product_created: DISCORD_COLORS.green,
  product_published: DISCORD_COLORS.green,
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
  order_cancelled: DISCORD_COLORS.red,
  product_archived: DISCORD_COLORS.red,
  role_deleted: DISCORD_COLORS.red,
  role_unassigned: DISCORD_COLORS.red,
  warehouse_transfer_rejected: DISCORD_COLORS.red,
};

export interface NotifyOptions {
  // Also used to build a "go to this thing" link (lib/admin/entityLinks.ts)
  // wherever the notification is shown. Instant-Publish's Approve/Revert
  // buttons specifically require `relatedEntityType: "product"` plus
  // `auditLogId` (that combination marks the row `resolution: "pending"`)
  // — every other entity type here just gets a plain link, no resolve UI.
  relatedEntityType?: AuditEntityType;
  relatedEntityId?: string;
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
  // "Resolvable" (Approve/Revert buttons) is specifically the Instant-
  // Publish flow — it always passes auditLogId alongside the entity ref.
  // Any other caller can still pass relatedEntityType/relatedEntityId on
  // their own, purely so the bell/page can link to the entity — that must
  // NOT also flip resolution to "pending", or an unrelated notification
  // (e.g. an order update) would incorrectly grow Approve/Revert controls.
  const hasEntityRef = Boolean(options?.relatedEntityType && options?.relatedEntityId);
  const resolvable = hasEntityRef && options?.auditLogId ? { auditLogId: options.auditLogId } : undefined;

  const { error } = await supabaseAdmin.from("notifications").insert({
    type,
    title,
    body,
    related_entity_type: hasEntityRef ? options!.relatedEntityType : null,
    related_entity_id: hasEntityRef ? options!.relatedEntityId : null,
    audit_log_id: resolvable?.auditLogId ?? null,
    resolution: resolvable ? "pending" : "n/a",
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
}

// Customer-facing sibling of notify() — writes to user_notifications
// (RLS-scoped to the recipient, see supabase/migrations/20260805000001_user_notifications.sql)
// instead of the admin-only `notifications` table. Never a replacement
// for an existing email — call this alongside sendEmail(), not instead
// of it, so the same event reaches both channels. Same never-throw
// contract as notify()/logAudit(): a failure to record is logged, never
// thrown, since it's supplementary to the write path it's attached to.
export async function notifyUser(
  userId: string,
  type: string,
  title: string,
  body: string = "",
  options?: NotifyUserOptions
): Promise<void> {
  const { error } = await supabaseAdmin.from("user_notifications").insert({
    user_id: userId,
    type,
    title,
    body,
    related_entity_type: options?.relatedEntityType ?? null,
    related_entity_id: options?.relatedEntityId ?? null,
  });
  if (error) {
    logError(`notifyUser(${type}) failed`, error.message);
  }
}
