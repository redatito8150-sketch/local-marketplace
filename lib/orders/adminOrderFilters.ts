import type { OrderRecord, OrderStatus } from "@/types";
import { getOrderActionOwner, normalizeOrderStatus } from "./lifecycle.ts";
import { normalizeReference, normalizeSearchText } from "../search/normalize.ts";

export type AdminOrderQueue = "all" | "attention" | "active" | "fulfilled" | "cancelled";
export type AdminOrderFilters = {
  q?: string;
  queue?: string;
  status?: string;
  brand?: string;
  from?: string;
  to?: string;
};

export function normalizeAdminOrderQueue(value?: string): AdminOrderQueue {
  return (["attention", "active", "fulfilled", "cancelled"].includes(value ?? "") ? value : "all") as AdminOrderQueue;
}

export function adminOrderNeedsAction(order: Pick<OrderRecord, "status" | "fulfillmentType" | "paymentMethod" | "paymentStatus" | "refundPendingAmountCents">) {
  const operationalHandoff = getOrderActionOwner(order.status as OrderStatus, order.fulfillmentType) === "zakhnook";
  const paymentException = order.paymentMethod === "card" && order.paymentStatus === "unpaid";
  return operationalHandoff || paymentException || (order.refundPendingAmountCents ?? 0) > 0;
}

export function belongsToAdminOrderQueue(order: OrderRecord, queue: AdminOrderQueue) {
  const status = normalizeOrderStatus(order.status);
  if (queue === "attention") return adminOrderNeedsAction(order);
  if (queue === "active") return ["confirmed", "preparing", "ready_for_pickup", "shipped"].includes(status);
  if (queue === "fulfilled") return status === "fulfilled";
  if (queue === "cancelled") return status === "cancelled";
  return true;
}

export function filterAdminOrders(orders: OrderRecord[], filters: AdminOrderFilters) {
  const queue = normalizeAdminOrderQueue(filters.queue);
  const query = filters.q ? normalizeSearchText(filters.q) : "";
  const referenceQuery = normalizeReference(filters.q ?? "");

  return orders.filter((order) => {
    if (!belongsToAdminOrderQueue(order, queue)) return false;
    if (filters.status && normalizeOrderStatus(order.status) !== filters.status) return false;
    if (filters.brand && !order.items.some((item) => item.brand === filters.brand)) return false;
    if (filters.from && new Date(order.createdAt) < new Date(`${filters.from}T00:00:00`)) return false;
    if (filters.to && new Date(order.createdAt) > new Date(`${filters.to}T23:59:59.999`)) return false;
    if (!query) return true;

    const searchable = normalizeSearchText([
      order.masterOrderNumber,
      order.orderNumber,
      order.shippingName,
      order.shippingEmail,
      order.shippingPhone,
      ...order.items.flatMap((item) => [item.name, item.brand, item.color ?? "", item.size]),
    ].join(" "));
    const referenceMatches = referenceQuery.length >= 3
      && [order.masterOrderNumber, order.orderNumber].some((value) => normalizeReference(value ?? "").includes(referenceQuery));
    return searchable.includes(query) || referenceMatches;
  });
}

export interface AdminPurchaseGroup {
  id: string;
  number: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  shipments: OrderRecord[];
  items: OrderRecord["items"];
  subtotalEgp: number;
  subtotalUsd: number;
}

export function groupAdminOrders(orders: OrderRecord[]): AdminPurchaseGroup[] {
  const grouped = new Map<string, AdminPurchaseGroup>();
  for (const order of orders) {
    const key = order.masterOrderId || order.id;
    const group = grouped.get(key) ?? {
      id: key,
      number: order.masterOrderNumber || order.orderNumber,
      createdAt: order.createdAt,
      customerName: order.shippingName,
      customerEmail: order.shippingEmail,
      shipments: [],
      items: [],
      subtotalEgp: 0,
      subtotalUsd: 0,
    };
    group.shipments.push(order);
    group.items.push(...order.items);
    group.subtotalEgp += order.subtotalEgp - order.discountAmountEgp + order.shippingFeeEgp;
    group.subtotalUsd += order.subtotalUsd;
    if (Date.parse(order.createdAt) > Date.parse(group.createdAt)) group.createdAt = order.createdAt;
    grouped.set(key, group);
  }
  return [...grouped.values()];
}
