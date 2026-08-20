import type { DeletionBlocker, DeletionBlockerDestination } from "@/lib/admin/productDeletion";

// Brand-portal counterpart to lib/admin/productDeletionLinks.ts. The RPC's
// own `href` values (private.compute_product_deletion_eligibility in
// supabase/migrations/20260819120000_...sql) point at admin-only routes for
// a few codes, since that same JSON is also read by the admin dashboard —
// a brand user needs the brand-portal equivalent instead, and a couple of
// admin-only actions (releasing a hold, resolving warehouse quarantine)
// have no brand-portal page at all, so those deliberately return null and
// the UI shows an explicit Mahaly Admin notice rather than a dead link.
export function getBrandDeletionBlockerDestination(
  blocker: DeletionBlocker,
  brandParam: string
): DeletionBlockerDestination | null {
  const suffix = brandParam ? brandParam : "";
  switch (blocker.code) {
    case "PRODUCT_HAS_AVAILABLE_STOCK":
    case "PRODUCT_HAS_BRAND_STOCK":
      return { href: `/brand-portal/stock${suffix}`, label: "Review Stock" };
    case "PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT":
    case "PRODUCT_HAS_WAREHOUSE_HISTORY":
      return { href: `/brand-portal/warehouse${suffix}`, label: "View Warehouse Documents" };
    case "PRODUCT_HAS_ORDER_HISTORY":
    case "PRODUCT_HAS_COMPLETED_SALES":
    case "PRODUCT_HAS_OPEN_ORDERS":
    case "PRODUCT_HAS_CANCELLED_ORDERS":
      return { href: `/brand-portal/orders${suffix}`, label: "View Orders" };
    case "BRAND_HAS_OPEN_FULFILLMENT_TRANSITION":
      return { href: `/brand-portal${suffix}`, label: "View Fulfillment Status" };
    // Admin-only resolutions: a brand user has no page to act on these, so
    // no link is offered and the role-specific notice explains who handles it.
    case "PRODUCT_HAS_ACTIVE_HOLD":
    case "PRODUCT_HAS_UNRESOLVED_QUARANTINE":
    case "PRODUCT_HAS_INVENTORY_HISTORY":
    case "PRODUCT_HAS_REVIEWS":
    case "PRODUCT_HAS_REFUNDS":
    case "PRODUCT_HAS_OPEN_PAYMENT_ATTEMPT":
      return null;
    default:
      return null;
  }
}

export function getBrandDeletionBlockerNotice(blocker: DeletionBlocker): string | null {
  switch (blocker.code) {
    case "PRODUCT_HAS_ACTIVE_HOLD":
    case "PRODUCT_HAS_UNRESOLVED_QUARANTINE":
      return "This requires action from Mahaly Admin. No action is available in Brand Portal.";
    case "PRODUCT_HAS_OPEN_PAYMENT_ATTEMPT":
      return "Mahaly Admin is monitoring this payment. No action is available in Brand Portal.";
    default:
      return null;
  }
}
