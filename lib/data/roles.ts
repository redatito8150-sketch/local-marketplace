import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PermissionRecord, RoleRecord, RoleMemberRecord } from "@/types";

export async function getAllPermissions(): Promise<PermissionRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("permissions")
    .select("key, label, description, category")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`getAllPermissions failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    description: row.description,
    category: row.category,
  }));
}

export async function getAllRoles(): Promise<RoleRecord[]> {
  const [{ data: roles, error: rolesError }, { data: rolePerms, error: rpError }, { data: memberships, error: memError }] =
    await Promise.all([
      supabaseAdmin.from("roles").select("id, name, description, color, is_protected, rank, created_at").order("rank", { ascending: false }),
      supabaseAdmin.from("role_permissions").select("role_id, permission_key"),
      supabaseAdmin.from("user_roles").select("role_id"),
    ]);
  if (rolesError) throw new Error(`getAllRoles failed: ${rolesError.message}`);
  if (rpError) throw new Error(`getAllRoles (role_permissions) failed: ${rpError.message}`);
  if (memError) throw new Error(`getAllRoles (user_roles) failed: ${memError.message}`);

  const permsByRole = new Map<string, string[]>();
  for (const row of rolePerms ?? []) {
    const list = permsByRole.get(row.role_id) ?? [];
    list.push(row.permission_key);
    permsByRole.set(row.role_id, list);
  }
  const countByRole = new Map<string, number>();
  for (const row of memberships ?? []) {
    countByRole.set(row.role_id, (countByRole.get(row.role_id) ?? 0) + 1);
  }

  return (roles ?? []).map((role) => ({
    id: role.id,
    name: role.name,
    description: role.description ?? "",
    color: role.color,
    isProtected: role.is_protected,
    rank: role.rank,
    permissionKeys: permsByRole.get(role.id) ?? [],
    memberCount: countByRole.get(role.id) ?? 0,
    createdAt: role.created_at,
  }));
}

// Every (userId, roleId) pair on the platform, unfiltered — used by the
// merged /admin/users "People" tab to figure out, per row, which role(s)
// an account currently holds and its resulting rank, without an N+1
// query per row.
export async function getAllUserRoleAssignments(): Promise<{ userId: string; roleId: string }[]> {
  const { data, error } = await supabaseAdmin.from("user_roles").select("user_id, role_id");
  if (error) throw new Error(`getAllUserRoleAssignments failed: ${error.message}`);
  return (data ?? []).map((row) => ({ userId: row.user_id, roleId: row.role_id }));
}

export async function getRoleMembers(roleId: string): Promise<RoleMemberRecord[]> {
  const { data: memberships, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, assigned_at")
    .eq("role_id", roleId)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(`getRoleMembers failed: ${error.message}`);
  if (!memberships || memberships.length === 0) return [];

  const userIds = memberships.map((m) => m.user_id);
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);
  if (profilesError) throw new Error(`getRoleMembers (profiles) failed: ${profilesError.message}`);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return memberships.map((m) => ({
    userId: m.user_id,
    fullName: profileById.get(m.user_id)?.full_name ?? null,
    email: profileById.get(m.user_id)?.email ?? null,
    assignedAt: m.assigned_at,
  }));
}
