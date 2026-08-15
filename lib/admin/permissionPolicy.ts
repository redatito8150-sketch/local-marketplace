import type { PermissionKey } from "@/lib/supabase/permissions";

export const DENY_UNMAPPED_ADMIN_PATH = "deny_unmapped_admin_path" as const;

export type AdminPathRequirement =
  | PermissionKey
  | typeof DENY_UNMAPPED_ADMIN_PATH
  | null;

const ADMIN_PATH_RULES: ReadonlyArray<{
  matches: (pathname: string) => boolean;
  permission: PermissionKey;
}> = [
  {
    matches: (path) =>
      path.startsWith("/api/admin/users/") && path.endsWith("/role"),
    permission: "manage_roles",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/roles") || path.startsWith("/admin/roles"),
    permission: "manage_roles",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/users") ||
      path.startsWith("/admin/users") ||
      path === "/api/admin/search",
    permission: "manage_users",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/inventory") ||
      path.startsWith("/api/admin/warehouse") ||
      path.startsWith("/admin/warehouse") ||
      path.startsWith("/admin/low-stock"),
    permission: "manage_inventory",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/collections") ||
      path.startsWith("/admin/collections"),
    permission: "manage_collections",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/product-options") ||
      path.startsWith("/api/admin/products") ||
      path.startsWith("/admin/categories") ||
      path.startsWith("/admin/products"),
    permission: "manage_products",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/orders") ||
      path.startsWith("/admin/orders") ||
      path.startsWith("/api/admin/payments") ||
      path.startsWith("/admin/payments") ||
      path.startsWith("/api/admin/master-orders"),
    permission: "manage_orders",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/coupons") || path.startsWith("/admin/coupons"),
    permission: "manage_coupons",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/brands") || path.startsWith("/admin/brands"),
    permission: "manage_brands",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/applications") ||
      path.startsWith("/admin/applications"),
    permission: "manage_applications",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/reviews") || path.startsWith("/admin/reviews"),
    permission: "moderate_reviews",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/page-studio") ||
      path.startsWith("/admin/page-studio"),
    permission: "manage_page_studio",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/site-content") || path.startsWith("/admin/content"),
    permission: "manage_site_content",
  },
  {
    matches: (path) => path.startsWith("/admin/audit-log"),
    permission: "view_audit_log",
  },
  {
    matches: (path) =>
      path.startsWith("/admin/settings") ||
      path.startsWith("/api/admin/test-email") ||
      path.startsWith("/api/admin/test-discord"),
    permission: "manage_settings",
  },
  {
    matches: (path) =>
      path.startsWith("/api/admin/notifications") ||
      path.startsWith("/admin/notifications"),
    permission: "view_admin_notifications",
  },
  {
    matches: (path) => path === "/admin" || path.startsWith("/admin/analytics"),
    permission: "view_analytics",
  },
];

export function getAdminPathRequirement(pathname: string): AdminPathRequirement {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const isAdminPath =
    normalized === "/admin" ||
    normalized.startsWith("/admin/") ||
    normalized === "/api/admin" ||
    normalized.startsWith("/api/admin/");

  if (!isAdminPath) return null;
  return (
    ADMIN_PATH_RULES.find((rule) => rule.matches(normalized))?.permission ??
    DENY_UNMAPPED_ADMIN_PATH
  );
}
