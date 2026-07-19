import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/types";

// Every admin Route Handler calls this first and bails if it returns null —
// the app/admin/** layout redirect is a UX nicety, not a security boundary,
// since API routes are directly callable regardless of what the UI shows.
export async function requireAdminUser(): Promise<User | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return profile?.is_admin ? user : null;
}

const ROLE_RANK: Record<StaffRole, number> = { staff: 1, manager: 2, admin: 3 };

// Section-level gating on top of requireAdminUser()'s "can this account
// open /admin at all" check. Only accounts with is_admin=true ever carry a
// staff/manager/admin role — a false is_admin always fails this regardless
// of what `role` happens to say.
export async function requireStaffRole(
  minRole: StaffRole
): Promise<{ user: User; role: StaffRole } | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) return null;
  const rank = ROLE_RANK[profile.role as StaffRole] ?? 0;
  if (rank < ROLE_RANK[minRole]) return null;

  return { user, role: profile.role as StaffRole };
}
