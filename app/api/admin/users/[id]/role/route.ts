import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { safeErrorResponse } from "@/lib/apiError";
import { checkRateLimit } from "@/lib/rateLimit";

// The unified "Access" column's staff-tier path (People tab of
// /admin/users) — single-select, replace semantics: whatever role(s) the
// account currently holds are unassigned, then the requested one (if
// any) is assigned. `roleId: null` means "remove access entirely",
// which the underlying RPC always resolves to plain customer with zero
// access (see recompute_profile_tier in 20260806000003), never a
// partial step-down.
//
// This is deliberately a different route from
// /api/admin/roles/[id]/members (which stays additive/multi-role for
// the advanced Roles & Permissions tab) — both call the same rank-
// checked assign_user_role/unassign_user_role RPCs underneath, so the
// hierarchy rules are identical either way.
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requirePermission("manage_roles");
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-user-role-change:${auth.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const roleId = typeof body?.roleId === "string" ? body.roleId : null;

  let role: { id: string; name: string } | null = null;
  if (roleId) {
    const { data } = await supabaseAdmin.from("roles").select("id, name").eq("id", roleId).maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    role = data;
  }

  const { data: currentRoles } = await supabaseAdmin.from("user_roles").select("role_id").eq("user_id", params.id);

  for (const current of currentRoles ?? []) {
    if (current.role_id === roleId) continue;
    const { error } = await supabaseAdmin.rpc("unassign_user_role", {
      p_actor_id: auth.user.id,
      p_target_user_id: params.id,
      p_role_id: current.role_id,
    });
    if (error) {
      if (error.code === "P0001") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      return safeErrorResponse("admin.users.role.unassign", error, "Failed to update access");
    }
  }

  if (role && !(currentRoles ?? []).some((r) => r.role_id === role!.id)) {
    const { error } = await supabaseAdmin.rpc("assign_user_role", {
      p_actor_id: auth.user.id,
      p_target_user_id: params.id,
      p_role_id: role.id,
    });
    if (error) {
      if (error.code === "P0001") {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      return safeErrorResponse("admin.users.role.assign", error, "Failed to update access");
    }
  }

  await logAudit({
    actorId: auth.user.id,
    actorLabel: auth.user.email ?? auth.user.id,
    entityType: "profile",
    entityId: params.id,
    action: "role_change",
    after: { roleAssigned: role?.name ?? "Customer (no role)" },
  });
  await notify(role ? "role_assigned" : "role_unassigned", `Access updated to ${role?.name ?? "Customer"}`, "", {
    entityId: params.id,
    entityIdLabel: "User ID",
    actorLabel: auth.user.email ?? auth.user.id,
  });

  return NextResponse.json({ ok: true });
}
