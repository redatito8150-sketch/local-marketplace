import type { OrderStatus } from "@/types";
import { ORDER_STATUS_LABELS, orderStatusBadgeClass } from "@/lib/orders/lifecycle";

// Display-only mapping — the real OrderStatus enum in the DB doesn't line
// up with the customer-facing tab names ("pending"/"paid" both just mean
// "we're processing it" from the customer's point of view). No DB change;
// admin-facing order management keeps using the raw status values.
export { ORDER_STATUS_LABELS };

export const ORDER_STATUS_BADGE_CLASSES: Record<OrderStatus, string> = {
  confirmed: orderStatusBadgeClass("confirmed"),
  preparing: orderStatusBadgeClass("preparing"),
  ready_for_pickup: orderStatusBadgeClass("ready_for_pickup"),
  shipped: orderStatusBadgeClass("shipped"),
  fulfilled: orderStatusBadgeClass("fulfilled"),
  cancelled: orderStatusBadgeClass("cancelled"),
  pending: orderStatusBadgeClass("pending"),
  paid: orderStatusBadgeClass("paid"),
};

export type OrderStatusTab = "all" | "active" | "shipped" | "delivered" | "cancelled";

export const ORDER_STATUS_TABS: { id: OrderStatusTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "In progress" },
  { id: "shipped", label: "On the way" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
];

const TAB_TO_STATUSES: Record<OrderStatusTab, OrderStatus[]> = {
  all: ["confirmed", "preparing", "ready_for_pickup", "shipped", "fulfilled", "cancelled", "pending", "paid"],
  active: ["confirmed", "preparing", "ready_for_pickup", "pending", "paid"],
  shipped: ["shipped"],
  delivered: ["fulfilled"],
  cancelled: ["cancelled"],
};

export function statusesForTab(tab: OrderStatusTab): OrderStatus[] {
  return TAB_TO_STATUSES[tab];
}
