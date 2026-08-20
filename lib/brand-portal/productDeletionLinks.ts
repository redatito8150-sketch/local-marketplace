import type { DeletionBlocker } from "@/lib/admin/productDeletion";

// Brand-portal counterpart to lib/admin/productDeletionLinks.ts. The RPC's
// own `href` values (private.compute_product_deletion_eligibility in
// supabase/migrations/20260819120000_...sql) point at admin-only routes for
// a few codes, since that same JSON is also read by the admin dashboard —
// a brand user needs the brand-portal equivalent instead, and a couple of
// admin-only actions (releasing a hold, resolving warehouse quarantine)
// have no brand-portal page at all, so those deliberately return null
// rather than a dead link.
export function getBrandDeletionBlockerHref(blocker: DeletionBlocker, brandParam: string): string | null {
  const suffix = brandParam ? brandParam : "";
  switch (blocker.code) {
    case "PRODUCT_HAS_AVAILABLE_STOCK":
    case "PRODUCT_HAS_BRAND_STOCK":
      return `/brand-portal/stock${suffix}`;
    case "PRODUCT_HAS_OPEN_WAREHOUSE_DOCUMENT":
    case "PRODUCT_HAS_WAREHOUSE_HISTORY":
      return `/brand-portal/warehouse${suffix}`;
    case "PRODUCT_HAS_ORDER_HISTORY":
    case "PRODUCT_HAS_COMPLETED_SALES":
    case "PRODUCT_HAS_OPEN_ORDERS":
    case "PRODUCT_HAS_CANCELLED_ORDERS":
      return `/brand-portal/orders${suffix}`;
    case "BRAND_HAS_OPEN_FULFILLMENT_TRANSITION":
      return `/brand-portal${suffix}`;
    // Admin-only resolutions: a brand user has no page to act on these, so
    // no link is offered — the blocker's own resolution text already says
    // an admin must act.
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
