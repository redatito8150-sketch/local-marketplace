import { draftDaysRemaining } from "@/lib/admin/expireDrafts";
import type { BrandProductListItem } from "@/lib/data/brandPortal";

export function needsBrandProductAttention(product: BrandProductListItem) {
  const draftDays = product.status === "draft" ? draftDaysRemaining(product.draftStartedAt) : null;

  return product.status === "changes_requested"
    || (product.status === "published" && product.stockStatus !== "in_stock")
    || (draftDays != null && draftDays <= 3);
}
