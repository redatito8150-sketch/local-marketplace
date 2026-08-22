import {
  CheckCircle2,
  Clock3,
  FileText,
  PackageCheck,
  Truck,
  XCircle,
} from "lucide-react";
import type {
  WarehouseTransferItemRow,
  WarehouseTransferRow,
  WarehouseTransferStatus,
} from "@/lib/data/warehouse";

export type WarehouseTone = "amber" | "emerald" | "red" | "neutral" | "blue" | "violet";

export const OPEN_WAREHOUSE_STATUSES = new Set<WarehouseTransferStatus>([
  "draft",
  "pending",
  "submitted",
  "approved",
  "in_transit",
  "receiving",
  "partially_received",
]);

export const ACTION_REQUIRED_WAREHOUSE_STATUSES = new Set<WarehouseTransferStatus>([
  "pending",
  "submitted",
]);

export const WAREHOUSE_STATUS_META: Record<
  WarehouseTransferStatus,
  { label: string; shortLabel: string; tone: WarehouseTone; icon: React.ElementType; order: number }
> = {
  draft: { label: "Draft", shortLabel: "Draft", tone: "neutral", icon: FileText, order: 0 },
  pending: { label: "Requested", shortLabel: "Requested", tone: "amber", icon: Clock3, order: 1 },
  submitted: { label: "Submitted", shortLabel: "Submitted", tone: "amber", icon: Clock3, order: 1 },
  approved: { label: "Awaiting arrival", shortLabel: "Awaiting arrival", tone: "blue", icon: CheckCircle2, order: 2 },
  in_transit: { label: "In transit", shortLabel: "In transit", tone: "blue", icon: Truck, order: 3 },
  receiving: { label: "Receiving", shortLabel: "Receiving", tone: "violet", icon: PackageCheck, order: 4 },
  partially_received: { label: "Partially received", shortLabel: "Partial", tone: "violet", icon: PackageCheck, order: 4 },
  received: { label: "Received", shortLabel: "Received", tone: "emerald", icon: CheckCircle2, order: 5 },
  rejected: { label: "Rejected", shortLabel: "Rejected", tone: "red", icon: XCircle, order: 5 },
  cancelled: { label: "Cancelled", shortLabel: "Cancelled", tone: "neutral", icon: XCircle, order: 5 },
};

export function warehouseStatusMeta(
  status: WarehouseTransferStatus,
  direction: "to_local" | "to_brand",
): (typeof WAREHOUSE_STATUS_META)[WarehouseTransferStatus] {
  const base = WAREHOUSE_STATUS_META[status];
  if (direction !== "to_brand") return base;
  if (status === "pending" || status === "submitted") return { ...base, label: "Return requested", shortLabel: "Return requested" };
  if (status === "approved") return { ...base, label: "Preparing return", shortLabel: "Preparing return" };
  if (status === "in_transit") return { ...base, label: "In transit to brand", shortLabel: "In transit" };
  if (status === "receiving") return { ...base, label: "Confirming return", shortLabel: "Confirming" };
  if (status === "partially_received") return { ...base, label: "Return partially confirmed", shortLabel: "Partially confirmed" };
  if (status === "received") return { ...base, label: "Returned to brand", shortLabel: "Returned" };
  return base;
}

export function warehouseToneClass(tone: WarehouseTone): string {
  if (tone === "amber") return "bg-amber-50 text-amber-800";
  if (tone === "emerald") return "bg-emerald-50 text-emerald-800";
  if (tone === "red") return "bg-red-50 text-red-800";
  if (tone === "blue") return "bg-sky-50 text-sky-800";
  if (tone === "violet") return "bg-violet-50 text-violet-800";
  return "bg-[#e6e0d8] text-[#5b5049]";
}

export function discrepancyUnits(item: WarehouseTransferItemRow): number {
  return (item.damagedQty ?? 0) + (item.missingQty ?? 0);
}

export function hasUnresolvedQuarantine(item: WarehouseTransferItemRow): boolean {
  return discrepancyUnits(item) > 0 && !item.quarantineResolvedAt;
}

export function hasPendingBrandDeliveryNoteReview(
  transfer: Pick<WarehouseTransferRow, "direction" | "status" | "receivingNote" | "brandDeliveryNoteReviewedAt">,
): boolean {
  return transfer.direction === "to_brand"
    && transfer.status === "received"
    && Boolean(transfer.receivingNote?.trim())
    && !transfer.brandDeliveryNoteReviewedAt;
}

export function warehouseDocumentLabel(direction: "to_local" | "to_brand"): string {
  return direction === "to_local" ? "Stock transfer note" : "Stock return note";
}
