import { supabaseAdmin } from "@/lib/supabase/admin";

export type NotificationType =
  | "order_created"
  | "product_created"
  | "product_updated"
  | "product_published"
  | "product_archived"
  | "brand_application_submitted"
  | "low_stock"
  | "image_upload_failed"
  | "storage_error";

// Notifications are supplementary to the real write path they're attached
// to (an order, a product save, an application submission) — a failure to
// record one is logged, never thrown, so it can't take down the actual
// operation the admin cares about.
export async function notify(type: NotificationType, title: string, body: string = ""): Promise<void> {
  const { error } = await supabaseAdmin.from("notifications").insert({ type, title, body });
  if (error) {
    console.error(`notify(${type}) failed:`, error.message);
  }
}
