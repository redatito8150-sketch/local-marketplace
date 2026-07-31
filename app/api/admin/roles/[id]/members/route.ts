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

  // Holding any role at all requires being an admin-rank account — this
  // route only assigns the role; it doesn't also flip is_admin/role, since
  // that's the separate, already-audited set_user_access flow
  // (app/api/admin/users/[id]/route.ts). Assigning a role to a non-admin
  // account would be a silent no-op for them (requirePermission() checks
  // is_admin first), so refuse it up front instead.
  const { data: targetProfile } = await supabaseAdmin.from("profiles").select("is_admin").eq("id", profile.id).maybeSingle();
  if (!targetProfile?.is_admin) {
    return NextResponse.json(
      { error: "This account isn't an admin-rank account yet — grant admin access from Users first." },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: profile.id, role_id: params.id, assigned_by: auth.user.id })
    .select("user_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This account already has that role" }, { status: 409 });
    }
    return safeErrorResponse("admin.roles.members.add", error, "Failed to assign role");
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

  const { error } = await supabaseAdmin.from("user_roles").delete().eq("role_id", params.id).eq("user_id", userId);
  if (error) {
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
