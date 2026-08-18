import type { WarehouseCorrectionLineRow, WarehouseReceiptVariantOption } from "@/lib/data/warehouse";

export function buildWarehouseVariantLabels(variants: WarehouseReceiptVariantOption[]): Map<string, string> {
  return new Map(variants.map((variant) => [
    variant.variantId,
    `${variant.productName}${variant.optionLabel ? ` — ${variant.optionLabel}` : ""} · ${variant.sku}`,
  ]));
}

export function describeWarehouseCorrectionLine(
  line: WarehouseCorrectionLineRow,
  variantLabels: Map<string, string>,
): string {
  const quantity = `${line.quantity} ${line.quantity === 1 ? "unit" : "units"}`;
  const from = line.fromVariantId ? variantLabels.get(line.fromVariantId) ?? "recorded Variant" : null;
  const to = line.toVariantId ? variantLabels.get(line.toVariantId) ?? "correct Variant" : null;

  switch (line.action) {
    case "reclassify": return `Reclassified ${quantity}: ${from ?? "recorded Variant"} → ${to ?? "correct Variant"}`;
    case "adjust_in": return line.sourceBucket === "missing"
      ? `Recovered ${quantity} into sellable stock and closed the linked missing difference · ${to ?? "Variant"}`
      : `Added ${quantity} to sellable stock · ${to ?? "Variant"}`;
    case "adjust_out": return line.sourceBucket === "excess"
      ? `Removed ${quantity} from sellable stock and closed the linked excess difference · ${from ?? "Variant"}`
      : `Removed ${quantity} from sellable stock · ${from ?? "Variant"}`;
    case "move_to_hold": return `Moved ${quantity} from sellable stock to damaged hold · ${from ?? "Variant"}`;
    case "restore_to_sellable": return `Restored ${quantity} from damaged hold to sellable stock · ${to ?? "Variant"}`;
    case "return_to_brand": return `Returned ${quantity} from damaged hold to the brand · ${from ?? "Variant"}`;
    case "write_off": return `Wrote off ${quantity} from damaged hold · ${from ?? "Variant"}`;
    case "accept_discrepancy": return `Closed ${line.sourceBucket ?? "document"} difference · ${quantity} · no stock movement`;
  }
}
