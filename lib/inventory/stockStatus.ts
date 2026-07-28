import type { SellingStatus, StockStatus } from "@/types";

// The one shared Stock Status calculation used by every interface (product
// form, brand-owner Inventory page, admin Inventory/Low Stock pages, cart/
// checkout). Never duplicate this logic elsewhere.
export function calculateStockStatus(quantity: number, effectiveThreshold: number): StockStatus {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= effectiveThreshold) return "low_stock";
  return "in_stock";
}

// null/undefined override means "use the product's own default".
export function effectiveLowStockThreshold(
  overrideValue: number | null | undefined,
  productDefault: number
): number {
  return overrideValue ?? productDefault;
}

// A variant is purchasable only when all three hold: Selling Status is
// Active, quantity > 0, and the parent product is published/available —
// the product-level half of that last condition is checked by the caller
// (this function only knows about the variant + its own product's status).
export function isVariantPurchasable(input: {
  sellingStatus: SellingStatus;
  quantity: number;
  isArchived: boolean;
  productStatus?: string;
  pausedByBrand?: boolean;
}): boolean {
  if (input.isArchived) return false;
  if (input.sellingStatus !== "active") return false;
  if (input.quantity <= 0) return false;
  if (input.productStatus !== undefined && input.productStatus !== "published") return false;
  if (input.pausedByBrand) return false;
  return true;
}
