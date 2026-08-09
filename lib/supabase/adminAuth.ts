import type { User } from "@supabase/supabase-js";
import { headers } from "next/headers";
import {
  DENY_UNMAPPED_ADMIN_PATH,
  getAdminPathRequirement,
} from "@/lib/admin/permissionPolicy";
import { getUserPermissions } from "@/lib/supabase/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMfaUserState } from "@/lib/supabase/mfaAuth";
import type { StaffRole } from "@/types";

// Every admin Route Handler calls this first and bails if it returns null —
// the app/admin/** layout redirect is a UX nicety, not a security boundary,
// since API routes are directly callable regardless of what the UI shows.
export async function requireAdminUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const authState = await getMfaUserState(supabase);
  if (authState.status !== "authenticated") return null;
  const { user } = authState;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) return null;
  return (await hasRequiredPathPermission(user.id)) ? user : null;
}

async function hasRequiredPathPermission(userId: string): Promise<boolean> {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get("x-pathname");
  if (!pathname) return false;

  const requirement = getAdminPathRequirement(pathname);
  if (requirement === null) return true;
  if (requirement === DENY_UNMAPPED_ADMIN_PATH) return false;

  const permissions = await getUserPermissions(userId);
  return permissions.has(requirement);
}

const ROLE_RANK: Record<StaffRole, number> = { staff: 1, manager: 2, admin: 3 };

// Section-level gating on top of requireAdminUser()'s "can this account
// open /admin at all" check. Only accounts with is_admin=true ever carry a
// staff/manager/admin role — a false is_admin always fails this regardless
// of what `role` happens to say.
export async function requireStaffRole(
  minRole: StaffRole
): Promise<{ user: User; role: StaffRole } | null> {
  const supabase = await createSupabaseServerClient();
  const authState = await getMfaUserState(supabase);
  if (authState.status !== "authenticated") return null;
  const { user } = authState;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) return null;
  if (!(await hasRequiredPathPermission(user.id))) return null;
  const rank = ROLE_RANK[profile.role as StaffRole] ?? 0;
  if (rank < ROLE_RANK[minRole]) return null;

  return { user, role: profile.role as StaffRole };
}
