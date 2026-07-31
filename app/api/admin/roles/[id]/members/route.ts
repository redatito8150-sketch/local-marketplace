import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRoleMembers } from "@/lib/data/roles";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { safeErrorResponse } from "@/lib/apiError";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requirePermission("manage_roles");
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const members = await getRoleMembers(params.id);
  return NextResponse.json({ members });
}

// Assigns a role by the target account's email — mirrors the existing
// admin/brands/[slug]/owner route's "look up by email, not by asking the
// caller to already know a user id" pattern.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requirePermission("manage_roles");
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-roles-assign:${auth.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const { data: role } = await supabaseAdmin.from("roles").select("id, name").eq("id", params.id).maybeSingle();
  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin.from("profiles").select("id, email").eq("email", email).maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: "No account found with that email — they need to sign up first" }, { status: 404 });
  }

  // The RPC (20260806000003) re-validates permission + rank hierarchy +
  // self-protection server-side and flips is_admin/role for the target
  // atomically — assigning a role now grants admin access, it doesn't
  // require it beforehand.
  const { error } = await supabaseAdmin.rpc("assign_user_role", {
    p_actor_id: auth.user.id,
    p_target_user_id: profile.id,
    p_role_id: params.id,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This account already has that role" }, { status: 409 });
    }
    // P0001 = the RPC's own `raise exception` — always one of its
    // deliberately hand-written, safe user-facing strings (never a raw
    // schema/constraint leak), so it's fine to pass straight through.
    if (error.code === "P0001") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return safeErrorResponse("admin.roles.members.mutate", error, "Failed to update role assignment");
  }

  await logAudit({
    actorId: auth.user.id,
    actorLabel: auth.user.email ?? auth.user.id,
    entityType: "profile",
    entityId: profile.id,
    action: "role_change",
    after: { roleAssigned: role.name },
  });
  await notify("role_assigned", `${email} was given the ${role.name} role`, "", {
    actorLabel: auth.user.email ?? auth.user.id,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requirePermission("manage_roles");
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { data: role } = await supabaseAdmin.from("roles").select("id, name").eq("id", params.id).maybeSingle();
  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const { data: targetProfile } = await supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle();

  const { error } = await supabaseAdmin.rpc("unassign_user_role", {
    p_actor_id: auth.user.id,
    p_target_user_id: userId,
    p_role_id: params.id,
  });
  if (error) {
    if (error.code === "P0001") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return safeErrorResponse("admin.roles.members.remove", error, "Failed to remove role");
  }

  await logAudit({
    actorId: auth.user.id,
    actorLabel: auth.user.email ?? auth.user.id,
    entityType: "profile",
    entityId: userId,
    action: "role_change",
    after: { roleRemoved: role.name },
  });
  await notify("role_unassigned", `${targetProfile?.email ?? userId} lost the ${role.name} role`, "", {
    actorLabel: auth.user.email ?? auth.user.id,
  });

  return NextResponse.json({ ok: true });
}
