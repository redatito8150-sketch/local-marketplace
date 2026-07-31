// Pure role-hierarchy logic, deliberately dependency-free (no Supabase
// client) so it's unit-testable without live credentials — matches the
// TS mirror of the Postgres logic in
// supabase/migrations/20260806000003_role_hierarchy_and_unified_access.sql
// (recompute_profile_tier / assign_user_role / unassign_user_role). The
// database is still the real trust boundary (SECURITY DEFINER,
// re-validates everything itself); this module exists so the same rules
// can be exercised in tests and reused by the API-layer checks in
// lib/supabase/permissions.ts without duplicating the numbers.

export const LEGACY_TIER_RANK: Record<string, number> = { admin: 100, manager: 50, staff: 10 };

// An actor can only manage (create/edit/delete/assign/remove) something
// strictly below their own highest rank — never at or above it.
export function canActorManage(actorMaxRank: number, targetRank: number): boolean {
  return actorMaxRank > targetRank;
}

export type DerivedTier =
  | { isAdmin: true; role: "admin" | "manager" | "staff" }
  | { isAdmin: false; role: "brand_owner" | "brand_assistant" | "customer" };

// Mirrors recompute_profile_tier(): given the user's highest held-role
// rank and whether they're linked to a brand, what should
// profiles.is_admin/profiles.role become. Holding zero roles always
// means zero internal-team access (no partial step-down) — the only
// exception is a real brand link, which is preserved rather than
// silently severed.
export function deriveProfileTier(
  maxRoleRank: number,
  brandLink: "owner" | "assistant" | null
): DerivedTier {
  if (maxRoleRank > 0) {
    if (maxRoleRank >= 100) return { isAdmin: true, role: "admin" };
    if (maxRoleRank >= 50) return { isAdmin: true, role: "manager" };
    return { isAdmin: true, role: "staff" };
  }
  if (brandLink === "owner") return { isAdmin: false, role: "brand_owner" };
  if (brandLink === "assistant") return { isAdmin: false, role: "brand_assistant" };
  return { isAdmin: false, role: "customer" };
}
