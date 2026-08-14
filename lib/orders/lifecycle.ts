import type { OrderStatus } from "@/types";

export type CanonicalOrderStatus =
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "shipped"
  | "fulfilled"
  | "cancelled";

export type OrderFulfillmentType = "mahaly_pool" | "brand_direct";
export type OrderActionOwner = "brand" | "zakhnook" | "none";

export const ORDER_STATUSES: CanonicalOrderStatus[] = [
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "shipped",
  "fulfilled",
  "cancelled",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready for pickup",
  shipped: "On the way",
  fulfilled: "Delivered",
  cancelled: "Cancelled",
  pending: "Confirmed",
  paid: "Confirmed",
};

export function normalizeOrderStatus(status: OrderStatus): CanonicalOrderStatus {
  if (status === "pending" || status === "paid") return "confirmed";
  return status;
}

export function orderStatusBadgeClass(status: OrderStatus | string): string {
  switch (normalizeOrderStatus(status as OrderStatus)) {
    case "fulfilled": return "bg-green-50 text-green-700";
    case "cancelled": return "bg-red-50 text-red-700";
    case "shipped": return "bg-blue-50 text-blue-700";
    case "ready_for_pickup": return "bg-violet-50 text-violet-700";
    case "preparing": return "bg-amber-50 text-amber-700";
    default: return "bg-stone-100 text-ink-soft/70";
  }
}

export function getOrderActionOwner(
  status: OrderStatus,
  fulfillmentType: OrderFulfillmentType
): OrderActionOwner {
  const normalized = normalizeOrderStatus(status);
  if (normalized === "confirmed" || normalized === "preparing") {
    return fulfillmentType === "brand_direct" ? "brand" : "zakhnook";
  }
  if (normalized === "ready_for_pickup" || normalized === "shipped") return "zakhnook";
  return "none";
}

export function brandOrderNeedsAction(order: {
  status: OrderStatus | string;
  fulfillmentType: OrderFulfillmentType;
}): boolean {
  return getOrderActionOwner(order.status as OrderStatus, order.fulfillmentType) === "brand";
}

export function getValidOrderStatusOptions(
  current: OrderStatus,
  _fulfillmentType: OrderFulfillmentType
): OrderStatus[] {
  const normalized = normalizeOrderStatus(current);
  const options: OrderStatus[] = [current];
  if (normalized === "confirmed") options.push("preparing", "cancelled");
  else if (normalized === "preparing") options.push("ready_for_pickup", "cancelled");
  else if (normalized === "ready_for_pickup") options.push("shipped", "cancelled");
  else if (normalized === "shipped") options.push("fulfilled");
  return [...new Set(options)];
}
