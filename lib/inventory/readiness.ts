import { isVariantPurchasable } from "./stockStatus.ts";
import type { ProductVariantReadiness, SellingStatus } from "@/types";

export interface ReadinessVariantInput {
  quantity: number;
  sellingStatus: SellingStatus;
  isArchived: boolean;
}

// Total Inventory is always the sum across non-archived variants — the
// server-side source of truth (a client-submitted total is never trusted;
// see app/api/admin/products/route.ts / brand-portal equivalent, which
// never accept or persist a client total at all).
export function calculateTotalInventory(variants: ReadinessVariantInput[]): number {
  return variants.filter((v) => !v.isArchived).reduce((sum, v) => sum + v.quantity, 0);
}

export function calculateVariantReadiness(
  variants: ReadinessVariantInput[],
  productStatus: string
): ProductVariantReadiness {
  const active = variants.filter((v) => !v.isArchived);
  return {
    hasAtLeastOneVariant: active.length > 0,
    hasActivePurchasableVariant: active.some((v) =>
      isVariantPurchasable({ ...v, productStatus })
    ),
    hasValidInventory: active.length > 0 && active.every((v) => Number.isInteger(v.quantity) && v.quantity >= 0),
    hasValidVariantCombinations: active.length > 0,
  };
}
