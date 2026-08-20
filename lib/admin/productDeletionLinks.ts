import type { DeletionBlocker, DeletionBlockerDestination } from "@/lib/admin/productDeletion";

export function getAdminDeletionBlockerDestination(
  blocker: DeletionBlocker,
  productId: string
): DeletionBlockerDestination | null {
  const encodedProductId = encodeURIComponent(productId);

  switch (blocker.code) {
    case "PRODUCT_HAS_INVENTORY_HISTORY":
    case "PRODUCT_HAS_AVAILABLE_STOCK":
    case "PRODUCT_HAS_BRAND_STOCK":
      return { href: `/admin/inventory?productId=${encodedProductId}`, label: "View Inventory" };
    case "PRODUCT_HAS_WAREHOUSE_HISTORY":
    case "PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT":
    case "PRODUCT_HAS_UNRESOLVED_QUARANTINE":
      return { href: "/admin/warehouse", label: "View Warehouse" };
    case "BRAND_HAS_OPEN_FULFILLMENT_TRANSITION":
      return { href: "/admin/brands", label: "View Brands" };
    case "PRODUCT_HAS_ACTIVE_HOLD":
      return null;
    case "PRODUCT_HAS_ORDER_HISTORY":
    case "PRODUCT_HAS_COMPLETED_SALES":
    case "PRODUCT_HAS_OPEN_ORDERS":
    case "PRODUCT_HAS_CANCELLED_ORDERS":
      return { href: "/admin/orders", label: "View Orders" };
    case "PRODUCT_HAS_REFUNDS":
    case "PRODUCT_HAS_OPEN_PAYMENT_ATTEMPT":
      return { href: "/admin/payments", label: "View Payments" };
    case "PRODUCT_HAS_REVIEWS":
      return { href: "/admin/reviews", label: "View Reviews" };
    default:
      return null;
  }
}
