import type { OrderRecord, OrderStatus } from "@/types";
import { getOrderActionOwner, normalizeOrderStatus } from "./lifecycle.ts";
import { normalizeReference, normalizeSearchText } from "../search/normalize.ts";

export type AdminOrderQueue = "all" | "attention" | "active" | "fulfilled" | "cancelled";
export type AdminOrderAttentionCode =
  | "refund_pending"
  | "payment_unpaid"
  | "delivery_overdue"
  | "tracking_missing"
  | "zakhnook_handoff";

export interface AdminOrderAttentionReason {
  code: AdminOrderAttentionCode;
  label: string;
  detail: string;
  tone: "critical" | "warning" | "neutral";
  shipmentId: string;
}

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

function normalizeDateParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value) ? value : undefined;
}

export function normalizeAdminOrderFilters(filters: AdminOrderFilters): AdminOrderFilters & { queue: AdminOrderQueue } {
  let from = normalizeDateParam(filters.from);
  let to = normalizeDateParam(filters.to);
  if (from && to && from > to) [from, to] = [to, from];
  const status = ["confirmed", "preparing", "ready_for_pickup", "shipped", "fulfilled", "cancelled"].includes(filters.status ?? "")
    ? filters.status
    : undefined;
  return {
    q: filters.q?.trim().slice(0, 160) || undefined,
    queue: normalizeAdminOrderQueue(filters.queue),
    status,
    brand: filters.brand?.trim().slice(0, 120) || undefined,
    from,
    to,
  };
}

export function getAdminOrderAttentionReasons(
  order: Pick<OrderRecord, "id" | "status" | "fulfillmentType" | "paymentMethod" | "paymentStatus" | "refundPendingAmountCents" | "expectedDeliveryAt" | "trackingNumber">,
  now = new Date()
): AdminOrderAttentionReason[] {
  const status = normalizeOrderStatus(order.status as OrderStatus);
  const reasons: AdminOrderAttentionReason[] = [];
  if ((order.refundPendingAmountCents ?? 0) > 0) {
    reasons.push({ code: "refund_pending", label: "Refund pending", detail: "A refund request is waiting for provider confirmation.", tone: "critical", shipmentId: order.id });
  }
  if (order.paymentMethod === "card" && order.paymentStatus === "unpaid") {
    reasons.push({ code: "payment_unpaid", label: "Payment issue", detail: "This card shipment is still marked unpaid.", tone: "critical", shipmentId: order.id });
  }
  if (order.expectedDeliveryAt && !["fulfilled", "cancelled"].includes(status) && Date.parse(order.expectedDeliveryAt) < now.getTime()) {
    reasons.push({ code: "delivery_overdue", label: "Delivery overdue", detail: "The expected delivery time has passed.", tone: "critical", shipmentId: order.id });
  }
  if (status === "shipped" && !order.trackingNumber?.trim()) {
    reasons.push({ code: "tracking_missing", label: "Tracking missing", detail: "Add the carrier reference for this dispatched shipment.", tone: "warning", shipmentId: order.id });
  }
  if (getOrderActionOwner(order.status as OrderStatus, order.fulfillmentType) === "zakhnook") {
    const detail = status === "confirmed"
      ? "Zakhnook owns confirmation and preparation for this warehouse shipment."
      : status === "ready_for_pickup"
        ? "Zakhnook owns pickup and dispatch for this shipment."
        : "Zakhnook owns the delivery completion step.";
    reasons.push({ code: "zakhnook_handoff", label: "Zakhnook action", detail, tone: "neutral", shipmentId: order.id });
  }
  return reasons;
}

export function adminOrderNeedsAction(order: Pick<OrderRecord, "id" | "status" | "fulfillmentType" | "paymentMethod" | "paymentStatus" | "refundPendingAmountCents" | "expectedDeliveryAt" | "trackingNumber">) {
  return getAdminOrderAttentionReasons(order).length > 0;
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
  updatedAt: string;
  customerName: string;
  customerEmail: string;
  customerCity: string;
  shipments: OrderRecord[];
  items: OrderRecord["items"];
  subtotalEgp: number;
  subtotalUsd: number;
  attentionReasons: AdminOrderAttentionReason[];
  attentionShipmentId?: string;
  progress: {
    total: number;
    delivered: number;
    cancelled: number;
    active: number;
    percent: number;
    label: string;
  };
}

export function groupAdminOrders(orders: OrderRecord[]): AdminPurchaseGroup[] {
  const grouped = new Map<string, AdminPurchaseGroup>();
  for (const order of orders) {
    const key = order.masterOrderId || order.id;
    const group = grouped.get(key) ?? {
      id: key,
      number: order.masterOrderNumber || order.orderNumber,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt ?? order.createdAt,
      customerName: order.shippingName,
      customerEmail: order.shippingEmail,
      customerCity: order.shippingCity,
      shipments: [],
      items: [],
      subtotalEgp: 0,
      subtotalUsd: 0,
      attentionReasons: [],
      progress: { total: 0, delivered: 0, cancelled: 0, active: 0, percent: 0, label: "" },
    };
    group.shipments.push(order);
    group.items.push(...order.items);
    group.subtotalEgp += order.subtotalEgp - order.discountAmountEgp + order.shippingFeeEgp;
    group.subtotalUsd += order.subtotalUsd;
    if (Date.parse(order.createdAt) > Date.parse(group.createdAt)) group.createdAt = order.createdAt;
    const orderUpdatedAt = order.updatedAt ?? order.createdAt;
    if (Date.parse(orderUpdatedAt) > Date.parse(group.updatedAt)) group.updatedAt = orderUpdatedAt;
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group) => {
    const attentionReasons = group.shipments.flatMap((shipment) => getAdminOrderAttentionReasons(shipment));
    const delivered = group.shipments.filter((shipment) => normalizeOrderStatus(shipment.status) === "fulfilled").length;
    const cancelled = group.shipments.filter((shipment) => normalizeOrderStatus(shipment.status) === "cancelled").length;
    const total = group.shipments.length;
    const active = total - delivered - cancelled;
    const progressByStatus: Record<string, number> = {
      confirmed: 10,
      preparing: 35,
      ready_for_pickup: 55,
      shipped: 75,
      fulfilled: 100,
      cancelled: 100,
    };
    const progressPercent = total
      ? Math.round(group.shipments.reduce((sum, shipment) => sum + (progressByStatus[normalizeOrderStatus(shipment.status)] ?? 0), 0) / total)
      : 0;
    const label = total === 1
      ? delivered ? "Delivered" : cancelled ? "Cancelled" : "Shipment in progress"
      : delivered === total
        ? "All shipments delivered"
        : cancelled === total
          ? "All shipments cancelled"
          : `${delivered} of ${total} delivered${cancelled ? ` · ${cancelled} cancelled` : ""}`;
    return {
      ...group,
      attentionReasons,
      attentionShipmentId: attentionReasons[0]?.shipmentId,
      progress: {
        total,
        delivered,
        cancelled,
        active,
        percent: progressPercent,
        label,
      },
    };
  });
}
