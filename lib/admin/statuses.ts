export const ORDER_STATUSES = ["pending", "paid", "shipped", "fulfilled", "cancelled"] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatusValue, string> = {
  pending: "Pending",
  paid: "Paid",
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
    case "paid":
      return "bg-beige-100 text-ink";
    default:
      return "bg-stone-100 text-ink-soft/70"; // pending
  }
}

export const APPLICATION_STATUSES = ["new", "reviewing", "approved", "rejected"] as const;
export type ApplicationStatusValue = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatusValue, string> = {
  new: "New",
  reviewing: "Reviewing",
  approved: "Approved",
  rejected: "Rejected",
};

export function applicationStatusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
      return "bg-green-50 text-green-700";
    case "rejected":
      return "bg-red-50 text-red-700";
    case "reviewing":
      return "bg-blue-50 text-blue-700";
    default:
      return "bg-stone-100 text-ink-soft/70"; // new
  }
}
