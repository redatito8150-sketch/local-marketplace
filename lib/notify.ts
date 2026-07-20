import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendToDiscord, buildDiscordDescription, DISCORD_COLORS } from "@/lib/discord";
import { logError } from "@/lib/errorLog";

export type NotificationType =
  | "order_created"
  | "order_cancelled"
  | "product_created"
  | "product_updated"
  | "product_published"
  | "product_archived"
  | "brand_updated"
  | "brand_application_submitted"
  | "low_stock"
  | "image_upload_failed"
  | "storage_error";

// Green = something was added, red = something was removed, orange for
// everything else (edits, warnings).
const NOTIFICATION_TYPE_COLORS: Record<NotificationType, number> = {
  order_created: DISCORD_COLORS.green,
  product_created: DISCORD_COLORS.green,
  product_published: DISCORD_COLORS.green,
  brand_application_submitted: DISCORD_COLORS.green,
  product_updated: DISCORD_COLORS.orange,
  brand_updated: DISCORD_COLORS.orange,
  low_stock: DISCORD_COLORS.orange,
  image_upload_failed: DISCORD_COLORS.orange,
  storage_error: DISCORD_COLORS.orange,
  order_cancelled: DISCORD_COLORS.red,
  product_archived: DISCORD_COLORS.red,
};

export interface NotifyOptions {
  // Instant-Publish only: presence of BOTH marks the row `resolution:
  // "pending"` so the bell/page render Approve/Revert buttons — never set
  // outside the brand portal's own product write routes.
  relatedEntityType?: "product";
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
  const resolvable =
    options?.relatedEntityType && options?.relatedEntityId
      ? {
          relatedEntityType: options.relatedEntityType,
          relatedEntityId: options.relatedEntityId,
          auditLogId: options.auditLogId ?? null,
        }
      : undefined;

  const { error } = await supabaseAdmin.from("notifications").insert({
    type,
    title,
    body,
    related_entity_type: resolvable?.relatedEntityType ?? null,
    related_entity_id: resolvable?.relatedEntityId ?? null,
    audit_log_id: resolvable?.auditLogId ?? null,
    resolution: resolvable ? "pending" : "n/a",
  });
  if (error) {
    logError(`notify(${type}) failed`, error.message);
  }

  const meta = [...(options?.meta ?? [])];
  if (resolvable) {
    meta.unshift({ label: "Product ID", value: resolvable.relatedEntityId });
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
  await sendToDiscord("notifications", {
    description: buildDiscordDescription({
      headline: title,
      meta,
      detailLabel: options?.detailLabel,
      detailBody: body || undefined,
    }),
    color: NOTIFICATION_TYPE_COLORS[type],
  });
}
