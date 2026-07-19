import type { ProductColorOption } from "@/types";
import type { VariantInput } from "./productValidation";

function comboKey(color?: string, size?: string): string {
  return `${color ?? ""}::${size ?? ""}`;
}

// Regenerates the variant row list to match the current color/size
// selections, preserving already-entered data (qty, sku, threshold, price
// override, availability) for combinations that still exist, and dropping
// rows for combinations that no longer do. With no colors and no sizes,
// a single "default" variant (color/size both undefined) represents the
// whole product — every product always has at least one variant row.
export function reconcileVariants(
  colors: ProductColorOption[],
  sizes: string[],
  current: VariantInput[]
): VariantInput[] {
  const byCombo = new Map(current.map((v) => [comboKey(v.color, v.size), v]));

  // Ignore colors still mid-edit with a blank name (e.g. right after
  // clicking "Add color") and blank size entries — neither should ever
  // produce a variant row on its own.
  const namedColors = colors.filter((c) => c.name.trim());
  const namedSizes = sizes.filter((s) => s.trim());

  const comboList: { color?: string; size?: string }[] =
    namedColors.length === 0 && namedSizes.length === 0
      ? [{ color: undefined, size: undefined }]
      : namedColors.length === 0
      ? namedSizes.map((size) => ({ size }))
      : namedSizes.length === 0
      ? namedColors.map((color) => ({ color: color.name }))
      : namedColors.flatMap((color) => namedSizes.map((size) => ({ color: color.name, size })));

  // De-duplicate in case two color rows end up sharing the same name (e.g.
  // both still blank mid-edit) so the grid never shows the same combo twice.
  const uniqueCombos = new Map(comboList.map((c) => [comboKey(c.color, c.size), c]));

  return [...uniqueCombos.values()].map(({ color, size }) => {
    const existing = byCombo.get(comboKey(color, size));
    if (existing) return existing;
    return {
      color,
      size,
      sku: "",
      quantity: 0,
      lowStockThreshold: 0,
      availabilityStatus: "available",
    };
  });
}
