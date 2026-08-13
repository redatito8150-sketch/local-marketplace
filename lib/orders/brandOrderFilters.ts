import type { BrandOrder } from "@/lib/data/brandPortal";
import { normalizeReference, normalizeSearchText } from "../search/normalize.ts";

export type BrandOrderQueue = "all" | "attention" | "active" | "fulfilled" | "cancelled";
export type BrandOrderFilters = { q?: string; queue?: string; from?: string; to?: string; sort?: string };

export function normalizeBrandOrderQueue(value?: string): BrandOrderQueue {
  return (["attention", "active", "fulfilled", "cancelled"].includes(value ?? "") ? value : "all") as BrandOrderQueue;
}

export function belongsToBrandOrderQueue(order: Pick<BrandOrder, "status" | "fulfillmentType">, queue: BrandOrderQueue) {
  if (queue === "attention") return order.fulfillmentType === "brand_direct" && ["paid", "preparing"].includes(order.status);
  if (queue === "active") return ["pending", "paid", "preparing", "shipped"].includes(order.status);
  if (queue === "fulfilled") return order.status === "fulfilled";
  if (queue === "cancelled") return order.status === "cancelled";
  return true;
}

export function filterBrandOrders(orders: BrandOrder[], filters: BrandOrderFilters) {
  const queue = normalizeBrandOrderQueue(filters.queue);
  const query = filters.q ? normalizeSearchText(filters.q) : "";
  const referenceQuery = normalizeReference(filters.q ?? "");
  const filtered = orders.filter((order) => {
    if (!belongsToBrandOrderQueue(order, queue)) return false;
    if (query) {
      const searchableText = normalizeSearchText(
        `${order.orderNumber} ${order.shippingName} ${order.shippingCity} ${order.items
          .map((item) => `${item.name} ${item.color ?? ""} ${item.size}`)
          .join(" ")}`
      );
      const referenceMatches = referenceQuery.length >= 3
        && normalizeReference(order.orderNumber).includes(referenceQuery);
      if (!searchableText.includes(query) && !referenceMatches) return false;
    }
    if (filters.from && new Date(order.createdAt) < new Date(`${filters.from}T00:00:00`)) return false;
    if (filters.to && new Date(order.createdAt) > new Date(`${filters.to}T23:59:59.999`)) return false;
    return true;
  });
  filtered.sort((a, b) => filters.sort === "oldest" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return filtered;
}
