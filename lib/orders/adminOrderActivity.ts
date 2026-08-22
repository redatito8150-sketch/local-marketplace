import { ORDER_STATUS_LABELS } from "@/lib/admin/statuses";
import type { AuditLogRecord, OrderRecord, OrderStatus } from "@/types";

export interface AdminOrderActivityEntry {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  actor: string;
  actorRole?: string;
  source: "order" | "audit";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function statusLabel(value: unknown) {
  if (typeof value !== "string") return "Unknown";
  return ORDER_STATUS_LABELS[value as OrderStatus] ?? value.replaceAll("_", " ");
}

function auditTitle(log: AuditLogRecord) {
  const before = objectValue(log.beforeValue);
  const after = objectValue(log.afterValue);
  if (log.action === "status_change") return `Status changed to ${statusLabel(after.status)}`;
  if (log.action === "shipment_tracking_update") return "Shipping details updated";
  if (log.action === "refund_requested") return "Refund requested";
  if (log.action === "refund_confirmed") return "Refund confirmed";
  if (log.action === "refund_allocation_reversed") return "Refund allocation reversed";
  if (log.action === "update" && "internalNotes" in after) return "Internal note updated";
  return log.action.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function auditDetail(log: AuditLogRecord) {
  const before = objectValue(log.beforeValue);
  const after = objectValue(log.afterValue);
  if (log.action === "status_change") return `${statusLabel(before.status)} → ${statusLabel(after.status)}`;
  if (log.action === "shipment_tracking_update") {
    const changed: string[] = [];
    if (before.carrierName !== after.carrierName) changed.push("carrier");
    if (before.trackingNumber !== after.trackingNumber) changed.push("tracking number");
    if (before.expectedDeliveryAt !== after.expectedDeliveryAt) changed.push("expected delivery");
    return changed.length ? `Changed ${changed.join(", ")}.` : "Shipping details were saved.";
  }
  if (log.action === "update" && "internalNotes" in after) return "The admin-only note was changed.";
  if (typeof after.amountCents === "number") return `Amount: ${new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP" }).format(after.amountCents / 100)}`;
  return "Recorded in the immutable admin audit trail.";
}

function sameStatusEvent(log: AuditLogRecord, status: string, createdAt: string) {
  if (log.action !== "status_change") return false;
  const after = objectValue(log.afterValue);
  return after.status === status && Math.abs(Date.parse(log.createdAt) - Date.parse(createdAt)) <= 10_000;
}

export function buildAdminOrderActivity(order: OrderRecord, auditLogs: AuditLogRecord[]): AdminOrderActivityEntry[] {
  const auditEntries = auditLogs.map((log): AdminOrderActivityEntry => ({
    id: `audit-${log.id}`,
    title: auditTitle(log),
    detail: auditDetail(log),
    createdAt: log.createdAt,
    actor: log.actorName || log.actorLabel || "System",
    actorRole: log.actorRoleLabel,
    source: "audit",
  }));
  const statusEntries = (order.statusHistory ?? [])
    .filter((entry) => !auditLogs.some((log) => sameStatusEvent(log, entry.status, entry.createdAt)))
    .map((entry): AdminOrderActivityEntry => ({
      id: `status-${entry.id}`,
      title: ORDER_STATUS_LABELS[entry.status] ?? entry.status,
      detail: entry.note ?? "Shipment status updated.",
      createdAt: entry.createdAt,
      actor: entry.actorName || entry.actorEmail || (entry.actorId ? "Recorded user" : "System"),
      actorRole: entry.actorRoleLabel,
      source: "order",
    }));
  return [
    {
      id: `placed-${order.id}`,
      title: "Order placed",
      detail: "Customer checkout recorded.",
      createdAt: order.createdAt,
      actor: "Storefront",
      source: "order" as const,
    },
    ...statusEntries,
    ...auditEntries,
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
