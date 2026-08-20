import type { DeletionBlocker } from "@/lib/admin/productDeletion";

export function getAdminDeletionBlockerHref(blocker: DeletionBlocker, productId: string) {
  const encodedProductId = encodeURIComponent(productId);

  switch (blocker.code) {
    case "PRODUCT_HAS_INVENTORY_HISTORY":
    case "PRODUCT_HAS_AVAILABLE_STOCK":
    case "PRODUCT_HAS_BRAND_STOCK":
      return `/admin/inventory?productId=${encodedProductId}`;
    case "PRODUCT_HAS_WAREHOUSE_HISTORY":
    case "PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT":
    case "PRODUCT_HAS_UNRESOLVED_QUARANTINE":
      return "/admin/warehouse";
    case "BRAND_HAS_OPEN_FULFILLMENT_TRANSITION":
      return "/admin/brands";
    case "PRODUCT_HAS_ACTIVE_HOLD":
      return "/admin/products/archived";
    case "PRODUCT_HAS_ORDER_HISTORY":
    case "PRODUCT_HAS_COMPLETED_SALES":
    case "PRODUCT_HAS_OPEN_ORDERS":
    case "PRODUCT_HAS_CANCELLED_ORDERS":
      return "/admin/orders";
    case "PRODUCT_HAS_REFUNDS":
    case "PRODUCT_HAS_OPEN_PAYMENT_ATTEMPT":
      return "/admin/payments";
    case "PRODUCT_HAS_REVIEWS":
      return "/admin/reviews";
    default:
      return blocker.href && blocker.href !== "/admin/inventory" ? blocker.href : null;
  }
}
