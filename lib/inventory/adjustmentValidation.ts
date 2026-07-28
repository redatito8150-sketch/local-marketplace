export const INVENTORY_REASONS = [
  "New Stock Received",
  "Stock Correction",
  "Damaged Items",
  "Lost Items",
  "Returned Items",
  "Manual Count",
  "Other",
] as const;

export type InventoryAdjustmentType = "add" | "remove" | "set";

export function validateInventoryAdjustment(input: {
  type: string;
  amount: number;
  reason: string;
  currentQuantity: number;
}): string | null {
  if (!["add", "remove", "set"].includes(input.type)) return "Choose a valid adjustment type";
  if (!Number.isInteger(input.amount) || input.amount < 0) return "Quantity must be a whole, non-negative number";
  if (!INVENTORY_REASONS.includes(input.reason as (typeof INVENTORY_REASONS)[number])) return "Choose an adjustment reason";
  if (input.type === "remove" && input.amount > input.currentQuantity) return "Inventory cannot become negative";
  return null;
}
