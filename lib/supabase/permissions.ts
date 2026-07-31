import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LEGACY_TIER_RANK, canActorManage } from "@/lib/roleHierarchy";

// Re-exported for backward compatibility — every call site in this
// project imports these from "@/lib/supabase/permissions"; the actual
// definitions live in lib/roleHierarchy.ts (dependency-free, so they can
// be unit-tested without Supabase credentials — see
// tests/roleHierarchy.test.ts).
export { LEGACY_TIER_RANK, canActorManage };

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

// A user's highest rank across every role they hold, floored by their
// legacy profiles.role tier. 0 means "holds no role and no legacy
// staff-tier rank" (a plain customer/brand_owner/brand_assistant).
export async function getUserMaxRank(userId: string): Promise<number> {
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle();
  const { data: userRoleRows } = await supabaseAdmin
    .from("user_roles")
    .select("roles(rank)")
    .eq("user_id", userId);

  const roleRanks = (userRoleRows ?? []).map((row) => {
    const roles = row.roles as unknown as { rank: number } | { rank: number }[] | null;
    if (Array.isArray(roles)) return roles[0]?.rank ?? 0;
    return roles?.rank ?? 0;
  });
  const maxRoleRank = roleRanks.length > 0 ? Math.max(...roleRanks) : 0;
  const legacyFloor = LEGACY_TIER_RANK[profile?.role ?? ""] ?? 0;
  return Math.max(maxRoleRank, legacyFloor);
}
