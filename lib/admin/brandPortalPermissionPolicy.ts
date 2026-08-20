import type { PermissionKey } from "@/lib/supabase/permissions";

// Corrective pass 2, Section 2 (docs/audits/2026-08-20-production-security-
// correctness-reliability-audit-en.md, AUTH-01 follow-up): manage_brands
// alone used to grant a limited custom-role staffer the exact same
// unrestricted owner-equivalent access as a genuine full-rank admin once
// they were impersonating a brand — manage_brands only ever gated *whether*
// impersonation could start, never *what* it could then do. This is the
// Brand Portal mirror of lib/admin/permissionPolicy.ts's own path -> required
// permission map, consumed the same way (see hasRequiredBrandPortalPathPermission
// in lib/supabase/brandAuth.ts): every /brand-portal or /api/brand-portal path
// maps to exactly one operation category, and a limited (non-full-rank)
// impersonator must hold that specific permission on top of manage_brands.
// A genuine Brand Owner/Assistant, and a full-rank admin (profiles.role =
// 'admin'), are never subject to this map — see brandAuth.ts for exactly
// where it is (and is not) applied.
export const DENY_UNMAPPED_BRAND_PORTAL_PATH = "deny_unmapped_brand_portal_path" as const;

export type BrandPortalPathRequirement =
  | PermissionKey
  | typeof DENY_UNMAPPED_BRAND_PORTAL_PATH
  | null;

const BRAND_PORTAL_PATH_RULES: ReadonlyArray<{
  matches: (pathname: string) => boolean;
  permission: PermissionKey;
}> = [
  {
    matches: (path) =>
      path.startsWith("/api/brand-portal/orders") || path.startsWith("/brand-portal/orders"),
    permission: "manage_orders",
  },
  {
    matches: (path) =>
      path.startsWith("/api/brand-portal/inventory") ||
      path.startsWith("/api/brand-portal/warehouse") ||
      path.startsWith("/brand-portal/stock") ||
      path.startsWith("/brand-portal/warehouse"),
    permission: "manage_inventory",
  },
  {
    matches: (path) =>
      path.startsWith("/api/brand-portal/collections") || path.startsWith("/brand-portal/collections"),
    permission: "manage_collections",
  },
  {
    matches: (path) =>
      path.startsWith("/api/brand-portal/product-options") ||
      path.startsWith("/api/brand-portal/products") ||
      path.startsWith("/brand-portal/products"),
    permission: "manage_products",
  },
  {
    matches: (path) =>
      path.startsWith("/api/brand-portal/brand-content") || path.startsWith("/brand-portal/page-content"),
    permission: "manage_page_studio",
  },
  {
    matches: (path) =>
      path.startsWith("/api/brand-portal/reviews") || path.startsWith("/brand-portal/reviews"),
    permission: "moderate_reviews",
  },
  {
    matches: (path) => path.startsWith("/brand-portal/logs"),
    permission: "view_audit_log",
  },
  {
    // The dashboard root — revenue/order-count/stock summary tiles.
    matches: (path) => path === "/brand-portal",
    permission: "view_analytics",
  },
];

export function getBrandPortalPathRequirement(pathname: string): BrandPortalPathRequirement {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const isBrandPortalPath =
    normalized === "/brand-portal" ||
    normalized.startsWith("/brand-portal/") ||
    normalized === "/api/brand-portal" ||
    normalized.startsWith("/api/brand-portal/");

  if (!isBrandPortalPath) return null;
  return (
    BRAND_PORTAL_PATH_RULES.find((rule) => rule.matches(normalized))?.permission ??
    DENY_UNMAPPED_BRAND_PORTAL_PATH
  );
}
