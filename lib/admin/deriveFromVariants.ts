import type { ProductColorOption } from "@/types";
import type { VariantInput } from "./productValidation";

export interface DerivedLegacyFields {
  sizes: string[];
  colors: ProductColorOption[];
  unavailableSizes: string[];
  inStock: boolean;
  totalQuantity: number;
}

// The old flat products.sizes/colors/unavailable_sizes/in_stock columns
// stay in the DB as read-only summaries computed from the variant rows,
// so anything not yet updated to read variants directly (search, filters,
// older pages until Phase 3) keeps seeing a coherent picture instead of
// stale/contradictory data.
export function deriveLegacyFieldsFromVariants(
  variants: VariantInput[],
  submittedColors: ProductColorOption[],
  trackInventory: boolean
): DerivedLegacyFields {
  const sizeSet = new Set<string>();
  const sizeIsAvailable = new Map<string, boolean>();
  let totalQuantity = 0;
  let anyAvailable = false;

  for (const variant of variants) {
    totalQuantity += variant.quantity;
    const available = variant.availabilityStatus === "available" && variant.quantity > 0;
    if (available) anyAvailable = true;

    if (variant.size) {
      sizeSet.add(variant.size);
      sizeIsAvailable.set(variant.size, (sizeIsAvailable.get(variant.size) ?? false) || available);
    }
  }

  const sizes = [...sizeSet];
  const unavailableSizes = sizes.filter((size) => !sizeIsAvailable.get(size));

  // Colors named on any variant, matched back to their hex from the
  // submitted color list (the same name+hex rows the variant grid was
  // generated from).
  const colorNames = new Set(variants.map((v) => v.color).filter((c): c is string => Boolean(c)));
  const colors = submittedColors.filter((c) => colorNames.has(c.name));

  return {
    sizes,
    colors,
    unavailableSizes,
    inStock: !trackInventory || anyAvailable,
    totalQuantity,
  };
}
