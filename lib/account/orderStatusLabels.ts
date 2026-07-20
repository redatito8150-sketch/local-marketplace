import type { OrderStatus } from "@/types";

// Display-only mapping — the real OrderStatus enum in the DB doesn't line
// up with the customer-facing tab names ("pending"/"paid" both just mean
// "we're processing it" from the customer's point of view). No DB change;
// admin-facing order management keeps using the raw status values.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Processing",
  paid: "Processing",
  shipped: "Shipped",
  fulfilled: "Delivered",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-amber-50 text-amber-700",
  shipped: "bg-blue-50 text-blue-700",
  fulfilled: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
};

export type OrderStatusTab = "all" | "processing" | "shipped" | "delivered" | "cancelled";

export const ORDER_STATUS_TABS: { id: OrderStatusTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "processing", label: "Processing" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
];

const TAB_TO_STATUSES: Record<OrderStatusTab, OrderStatus[]> = {
  all: ["pending", "paid", "shipped", "fulfilled", "cancelled"],
  processing: ["pending", "paid"],
  shipped: ["shipped"],
  delivered: ["fulfilled"],
  cancelled: ["cancelled"],
};

export function statusesForTab(tab: OrderStatusTab): OrderStatus[] {
  return TAB_TO_STATUSES[tab];
}
