import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Keys must match supabase/migrations/20260806000002_custom_roles_permissions.sql's
// seeded `permissions` rows exactly — this is the compile-time mirror of
// that runtime catalog, not a separate source of truth (the catalog's
// label/description/category still only live in the DB, fetched by the
// admin UI; this union is only for type-safe requirePermission() calls).
export type PermissionKey =
  | "manage_products"
  | "manage_inventory"
  | "manage_collections"
  | "manage_orders"
  | "manage_coupons"
  | "manage_brands"
  | "manage_applications"
  | "moderate_reviews"
  | "manage_page_studio"
  | "manage_site_content"
  | "manage_users"
  | "manage_roles";

// A legacy role='admin' account always has every permission, regardless of
// whether it's been assigned a custom role yet — same "server owner always
// has every permission" guarantee Discord itself makes, so a misconfigured
// or empty role table can never lock every admin out of managing roles.
export async function getUserPermissions(userId: string): Promise<Set<PermissionKey>> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.is_admin) return new Set();
  if (profile.role === "admin") {
    const { data: allPermissions } = await supabaseAdmin.from("permissions").select("key");
    return new Set((allPermissions ?? []).map((p) => p.key as PermissionKey));
  }

  const { data: userRoleRows } = await supabaseAdmin.from("user_roles").select("role_id").eq("user_id", userId);
  const roleIds = [...new Set((userRoleRows ?? []).map((r) => r.role_id as string))];
  if (roleIds.length === 0) return new Set();

  const { data: permissionRows } = await supabaseAdmin
    .from("role_permissions")
    .select("permission_key")
    .in("role_id", roleIds);

  return new Set((permissionRows ?? []).map((r) => r.permission_key as PermissionKey));
}

// Parallel to requireStaffRole()/requireAdminUser() — requires
// profiles.is_admin=true first (unchanged hard floor for reaching /admin
// at all), then checks the caller's roles for the specific permission.
export async function requirePermission(
  key: PermissionKey
): Promise<{ user: User; permissions: Set<PermissionKey> } | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const permissions = await getUserPermissions(user.id);
  if (!permissions.has(key)) return null;

  return { user, permissions };
}
