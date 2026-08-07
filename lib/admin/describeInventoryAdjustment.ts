// One readable line per touched variant, keyed by its real SKU — never the
// variant's UUID — so both the in-app notification and the Discord embed
// (via logAudit's after-only diff) show exactly what moved and by how
// much, instead of a raw dump of the request body.
export function describeInventoryAdjustments(
  items: { sku: string; previousQuantity: number; newQuantity: number }[]
): string {
  return items.map((item) => `${item.sku}: ${item.previousQuantity} → ${item.newQuantity}`).join("\n");
}
