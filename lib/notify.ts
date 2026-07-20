import { supabaseAdmin } from "@/lib/supabase/admin";

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

// Notifications are supplementary to the real write path they're attached
// to (an order, a product save, an application submission) — a failure to
// record one is logged, never thrown, so it can't take down the actual
// operation the admin cares about.
//
// `resolvable` is only set by brand-initiated product writes (Instant-
// Publish): it links the notification to the exact audit_log entry needed
// to revert, and starts it at resolution "pending" so the bell/page can
// render Approve/Revert buttons. Admin-initiated writes (and every other
// notification type) never set this, and stay at the default "n/a".
export async function notify(
  type: NotificationType,
  title: string,
  body: string = "",
  resolvable?: {
    relatedEntityType: "product";
    relatedEntityId: string;
    auditLogId: string | null;
  }
): Promise<void> {
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
    console.error(`notify(${type}) failed:`, error.message);
  }
}
