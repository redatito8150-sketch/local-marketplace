export const ORDER_STATUSES = ["pending", "paid", "preparing", "shipped", "fulfilled", "cancelled"] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatusValue, string> = {
  pending: "Pending",
  paid: "Paid",
  preparing: "Preparing",
  shipped: "Shipped",
  fulfilled: "Delivered",
  cancelled: "Cancelled",
};

// Mirrors public.transition_order_status()'s allowed-transition matrix
// exactly (supabase/migrations/20260810000005_order_integrity_and_
// idempotency.sql) and public.cancel_order()'s own status guard — the
// admin status dropdown previously listed all six ORDER_STATUSES
// unconditionally, with no idea that "paid" branches differently
// depending on fulfillment_type (brand_direct -> preparing, mahaly_pool
// -> shipped). Picking the wrong one for a Zakhnook-pool order (e.g.
// "Preparing", which only brand_direct orders can use) always failed
// server-side with INVALID_ORDER_TRANSITION — from the admin's
// perspective, indistinguishable from "the status can't be changed at
// all," since every other listed option was equally invalid for that
// order. This is the single source of truth both the dropdown and (by
// construction, since it's copied from the same migration) the RPC
// agree on — if the DB's matrix ever changes, this must change with it.
export function getValidOrderStatusOptions(
  current: OrderStatusValue,
  fulfillmentType: "mahaly_pool" | "brand_direct"
): OrderStatusValue[] {
  const options: OrderStatusValue[] = [current];

  if (current === "pending") options.push("paid");
  else if (current === "paid") {
    options.push(fulfillmentType === "mahaly_pool" ? "shipped" : "preparing");
  } else if (current === "preparing") options.push("shipped");
  else if (current === "shipped") options.push("fulfilled");

  if (current !== "cancelled" && current !== "shipped" && current !== "fulfilled") {
    options.push("cancelled");
  }

  return options;
}

export function orderStatusBadgeClass(status: string): string {
  switch (status) {
    case "fulfilled":
      return "bg-green-50 text-green-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    case "shipped":
      return "bg-blue-50 text-blue-700";
    case "preparing":
      return "bg-amber-50 text-amber-700";
    case "paid":
      return "bg-beige-100 text-ink";
    default:
      return "bg-stone-100 text-ink-soft/70"; // pending
  }
}

// Full 10-value lifecycle from the 2026-07-25 brand_application_workflow
// migration. "new"/"reviewing" are kept as legacy transitional values (see
// that migration's backfill) — no live row can carry them post-migration,
// but the type/labels keep covering them defensively.
export const APPLICATION_STATUSES = [
  "new",
  "reviewing",
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "resubmitted",
  "approved_pending_creation",
  "approved",
  "rejected",
  "withdrawn",
  "converted_to_brand",
] as const;
export type ApplicationStatusValue = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatusValue, string> = {
  new: "New",
  reviewing: "Reviewing",
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
  changes_requested: "Changes Requested",
  resubmitted: "Resubmitted",
  approved_pending_creation: "Approved (Pending Brand Creation)",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  converted_to_brand: "Converted to Brand",
};

export function applicationStatusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
    case "approved_pending_creation":
    case "converted_to_brand":
      return "bg-green-50 text-green-700";
    case "rejected":
    case "withdrawn":
      return "bg-red-50 text-red-700";
    case "under_review":
    case "reviewing":
    case "resubmitted":
      return "bg-blue-50 text-blue-700";
    case "changes_requested":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-stone-100 text-ink-soft/70"; // draft, submitted, new
  }
}

// payment_attempts.status — distinct from ORDER_STATUSES above. This is
// the payment gateway's own lifecycle (see supabase/migrations/
// 20260811000001_payment_attempts.sql), not an order's operational status;
// a single 'fulfilled' attempt can back several orders (one per bucket).
export const PAYMENT_ATTEMPT_STATUSES = [
  "created",
  "pending",
  "processing",
  "paid",
  "reflecting",
  "fulfilled",
  "fulfillment_failed",
  "failed",
  "expired",
  "cancelled",
] as const;
export type PaymentAttemptStatusValue = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

export const PAYMENT_ATTEMPT_STATUS_LABELS: Record<PaymentAttemptStatusValue, string> = {
  created: "Created",
  pending: "Pending",
  processing: "Processing",
  paid: "Paid",
  reflecting: "Reflecting",
  fulfilled: "Fulfilled",
  fulfillment_failed: "Fulfillment Failed",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

export function paymentAttemptStatusBadgeClass(status: string): string {
  switch (status) {
    case "fulfilled":
    case "paid":
      return "bg-green-50 text-green-700";
    case "fulfillment_failed":
    case "failed":
      return "bg-red-50 text-red-700";
    case "expired":
    case "cancelled":
      return "bg-slate-100 text-slate-600";
    case "reflecting":
    case "processing":
      return "bg-blue-50 text-blue-700";
    default:
      return "bg-amber-50 text-amber-700"; // created, pending
  }
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  order_created: "New Order",
  order_cancelled: "Order Cancelled",
  product_created: "Product Created",
  product_updated: "Product Updated",
  product_published: "Product Published",
  product_archived: "Product Archived",
  brand_updated: "Brand Page Updated",
  brand_application_submitted: "Brand Application",
  low_stock: "Low Stock",
  image_upload_failed: "Image Upload Failed",
  storage_error: "Storage Error",
};
