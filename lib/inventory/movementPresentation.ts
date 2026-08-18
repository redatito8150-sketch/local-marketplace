export type InventoryFilterOption = readonly [key: string, label: string];

export const INVENTORY_SOURCE_OPTIONS: readonly InventoryFilterOption[] = [
  ["admin", "Admin adjustment"],
  ["brand_portal", "Brand adjustment"],
  ["order", "Customer order"],
  ["order_cancellation", "Order cancellation"],
  ["warehouse_transfer", "Warehouse transfer"],
  ["warehouse_receipt", "Warehouse receipt"],
  ["warehouse_correction", "Warehouse correction"],
  ["product_editor", "Product setup"],
  ["fulfillment_transition", "Fulfillment transition"],
  ["migration", "Historical migration"],
] as const;

export const INVENTORY_MOVEMENT_GROUPS: readonly { label: string; options: readonly InventoryFilterOption[] }[] = [
  {
    label: "Sales",
    options: [
      ["order_placed", "Order placed"],
      ["order_cancelled", "Order cancelled"],
      ["return_restocked", "Return restocked"],
    ],
  },
  {
    label: "Warehouse",
    options: [
      ["warehouse_receipt_actual", "Receipt posted"],
      ["warehouse_transfer_received", "Transfer received"],
      ["warehouse_transfer_shipped", "Transfer shipped"],
      ["warehouse_return_reserved", "Return reserved"],
      ["warehouse_return_released", "Return released"],
      ["warehouse_quarantine_hold", "Moved to hold"],
      ["warehouse_quarantine_release", "Released from hold"],
    ],
  },
  {
    label: "Corrections",
    options: [
      ["admin_correction", "Admin correction"],
      ["warehouse_correction_adjustment", "Warehouse quantity correction"],
      ["warehouse_discrepancy_resolution", "Discrepancy resolved"],
      ["warehouse_reclassification_out", "Reclassification out"],
      ["warehouse_reclassification_in", "Reclassification in"],
    ],
  },
  {
    label: "Setup and system",
    options: [
      ["opening_balance", "Opening balance"],
      ["legacy_opening_balance", "Legacy opening balance"],
      ["manual_adjustment", "Manual adjustment"],
      ["fulfillment_transition_snapshot", "Fulfillment snapshot"],
      ["import", "Imported movement"],
      ["other", "Other movement"],
    ],
  },
] as const;

export const INVENTORY_MOVEMENT_OPTIONS: readonly InventoryFilterOption[] = INVENTORY_MOVEMENT_GROUPS.flatMap((group) => group.options);

const LOCATION_LABELS: Record<string, string> = {
  brand_location: "Brand stock",
  in_transit_to_zakhnook: "In transit",
  zakhnook_available: "Sellable at Zakhnook",
  zakhnook_quarantine: "Warehouse hold",
  returned_to_brand: "Returned to brand",
  sold_or_removed: "Sold or removed",
};

export function inventorySourceLabel(value: string): string {
  return INVENTORY_SOURCE_OPTIONS.find(([key]) => key === value)?.[1] ?? sentenceCase(value);
}

export function inventoryMovementLabel(value: string): string {
  return INVENTORY_MOVEMENT_OPTIONS.find(([key]) => key === value)?.[1] ?? sentenceCase(value);
}

export function inventoryLocationLabel(value: string | null): string | null {
  if (!value) return null;
  return LOCATION_LABELS[value] ?? sentenceCase(value);
}

export function sentenceCase(value: string): string {
  const normalized = value.replaceAll("_", " ").trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase() : "";
}

export function movementTone(delta: number): "in" | "out" | "neutral" {
  if (delta > 0) return "in";
  if (delta < 0) return "out";
  return "neutral";
}
