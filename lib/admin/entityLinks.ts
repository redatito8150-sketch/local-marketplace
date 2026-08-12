import type { AuditEntityType } from "@/lib/auditLog";
import { absoluteUrl } from "@/lib/seo";

// Maps an audit-log/notification entity reference to the real admin page
// for it — used both for the website's own <Link> (relative path) and the
// Discord embed's clickable markdown link (needs an absolute URL). Entity
// types with no single-item detail page resolve to the nearest relevant
// list/hub page instead of a dead end — not a deep link to the exact row,
// but still "go look at this" rather than nothing.
export function getEntityAdminPath(entityType: string, entityId: string): string | null {
  switch (entityType as AuditEntityType) {
    case "product":
      return `/admin/products/${entityId}/edit`;
    case "brand":
      return `/admin/brands/${entityId}/edit`;
    case "order":
      return `/admin/orders/${entityId}`;
    case "application":
      return `/admin/applications/${entityId}`;
    case "profile":
      return `/admin/users?q=${encodeURIComponent(entityId)}`;
    case "coupon":
      return `/admin/coupons/${entityId}/edit`;
    case "review":
      return `/admin/reviews`;
    case "page":
      return `/admin/page-studio/${entityId}`;
    case "site_content":
      return `/admin/content`;
    case "collection":
    case "option_type":
    case "option_value":
      return `/admin/products/categories`;
    case "inventory":
      return `/admin/low-stock`;
    case "warehouse_transfer":
      return `/admin/warehouse/${entityId}`;
    case "role":
      return `/admin/users?tab=roles`;
    case "payment_attempt":
      return `/admin/payments/${entityId}`;
    default:
      return null;
  }
}

export function getEntityAdminUrl(entityType: string, entityId: string): string | null {
  const path = getEntityAdminPath(entityType, entityId);
  return path ? absoluteUrl(path) : null;
}
