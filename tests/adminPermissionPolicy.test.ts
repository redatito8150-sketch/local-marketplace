import assert from "node:assert/strict";
import test from "node:test";
import {
  DENY_UNMAPPED_ADMIN_PATH,
  getAdminPathRequirement,
} from "../lib/admin/permissionPolicy.ts";

const cases = [
  ["/admin", "view_analytics"],
  ["/admin/analytics", "view_analytics"],
  ["/admin/orders/123", "manage_orders"],
  ["/api/admin/orders/export", "manage_orders"],
  ["/admin/products/categories", "manage_products"],
  ["/admin/categories", "manage_products"],
  ["/api/admin/inventory/adjustments", "manage_inventory"],
  ["/admin/inventory", "manage_inventory"],
  ["/admin/inventory/variant-history", "manage_inventory"],
  ["/admin/brands/acme/edit", "manage_brands"],
  ["/api/admin/applications/123/create-brand", "manage_applications"],
  ["/admin/reviews", "moderate_reviews"],
  ["/api/admin/page-studio/home/publish", "manage_page_studio"],
  ["/admin/content/journal", "manage_site_content"],
  ["/admin/users", "manage_users"],
  ["/api/admin/users/123/role", "manage_roles"],
  ["/api/admin/roles/123/members", "manage_roles"],
  ["/admin/audit-log", "view_audit_log"],
  ["/api/admin/notifications", "view_admin_notifications"],
  ["/api/admin/test-email", "manage_settings"],
] as const;

test("maps every sensitive admin surface to its granular permission", () => {
  for (const [pathname, permission] of cases) {
    assert.equal(getAdminPathRequirement(pathname), permission, pathname);
  }
});

test("fails closed for new or forgotten admin paths", () => {
  assert.equal(
    getAdminPathRequirement("/api/admin/new-sensitive-feature"),
    DENY_UNMAPPED_ADMIN_PATH
  );
  assert.equal(
    getAdminPathRequirement("/admin/new-sensitive-feature"),
    DENY_UNMAPPED_ADMIN_PATH
  );
});

test("does not gate non-admin application paths", () => {
  assert.equal(getAdminPathRequirement("/api/orders"), null);
  assert.equal(getAdminPathRequirement("/brand-portal/orders"), null);
});
