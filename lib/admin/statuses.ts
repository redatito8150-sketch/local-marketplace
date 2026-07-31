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
