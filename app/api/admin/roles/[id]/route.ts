import { NextRequest, NextResponse } from "next/server";
import { requirePermission, getUserMaxRank, canActorManage, type PermissionKey } from "@/lib/supabase/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { safeErrorResponse } from "@/lib/apiError";
import { checkRateLimit } from "@/lib/rateLimit";

const VALID_PERMISSION_KEYS: PermissionKey[] = [
  "manage_products",
  "manage_inventory",
  "manage_collections",
  "manage_orders",
  "manage_coupons",
  "manage_brands",
  "manage_applications",
  "moderate_reviews",
  "manage_page_studio",
  "manage_site_content",
  "manage_users",
  "manage_roles",
];

// Editing a role's own name/description/color is always allowed (even for
// the 3 protected defaults) — only deletion and permission changes on a
// protected role are refused, so "Admin" can never accidentally end up
// with fewer permissions than the rest of the system assumes it has.
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requirePermission("manage_roles");
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-roles-update:${auth.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const { data: existing } = await supabaseAdmin
    .from("roles")
    .select("id, name, description, color, is_protected, rank")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  const actorMaxRank = await getUserMaxRank(auth.user.id);

  const body = await request.json().catch(() => null);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === "string" && body.name.trim()) {
    if (body.name.trim().length > 50) {
      return NextResponse.json({ error: "Role name must be 50 characters or fewer" }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if (typeof body?.description === "string") patch.description = body.description.trim();
  if (typeof body?.color === "string") patch.color = body.color.trim() || null;

  // Rank changes are treated the same as permission changes: never on a
  // protected role, and both the role's current rank and the requested
  // new rank must sit strictly below the actor's own highest rank.
  if (Number.isInteger(body?.rank) && body.rank !== existing.rank) {
    if (existing.is_protected) {
      return NextResponse.json({ error: "Built-in roles' rank can't be changed." }, { status: 403 });
    }
    if (!canActorManage(actorMaxRank, existing.rank) || !canActorManage(actorMaxRank, body.rank as number)) {
      return NextResponse.json({ error: "You can't set a rank at or above your own rank" }, { status: 403 });
    }
    patch.rank = body.rank;
  }

  if (Object.keys(patch).length > 1) {
    const { error } = await supabaseAdmin.from("roles").update(patch).eq("id", params.id);
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A role with that name already exists" }, { status: 409 });
      }
      return safeErrorResponse("admin.roles.update", error, "Failed to update role");
    }
  }

  // Permission set replacement — every protected role (Admin/Manager/
  // Staff) refuses this, so the built-in defaults can't be silently
  // stripped down to nothing by mistake. Renaming/describing them is
  // still fine (handled above).
  if (Array.isArray(body?.permissionKeys)) {
    if (existing.is_protected) {
      return NextResponse.json(
        { error: "Built-in roles' permissions can't be changed — create a new role instead." },
        { status: 403 }
      );
    }
    if (!canActorManage(actorMaxRank, existing.rank)) {
      return NextResponse.json({ error: "You can't manage a role at or above your own rank" }, { status: 403 });
    }
    const requestedKeys = (body.permissionKeys as unknown[]).filter(
      (key): key is PermissionKey => typeof key === "string" && VALID_PERMISSION_KEYS.includes(key as PermissionKey)
    );
    const { error: deleteError } = await supabaseAdmin.from("role_permissions").delete().eq("role_id", params.id);
    if (deleteError) {
      return safeErrorResponse("admin.roles.permissions.replace", deleteError, "Failed to update permissions");
    }
    if (requestedKeys.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("role_permissions")
        .insert(requestedKeys.map((key) => ({ role_id: params.id, permission_key: key })));
      if (insertError) {
        return safeErrorResponse("admin.roles.permissions.replace", insertError, "Failed to update permissions");
      }
    }
  }

  await logAudit({
    actorId: auth.user.id,
    actorLabel: auth.user.email ?? auth.user.id,
    entityType: "profile",
    entityId: params.id,
    action: "update",
    before: existing,
    after: body,
  });
  await notify("role_updated", `Role updated: ${(patch.name as string) ?? existing.name}`, "", {
    entityId: params.id,
    entityIdLabel: "Role ID",
    actorLabel: auth.user.email ?? auth.user.id,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requirePermission("manage_roles");
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin
    .from("roles")
    .select("id, name, is_protected, rank")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }
  if (existing.is_protected) {
    return NextResponse.json({ error: "Built-in roles (Admin/Manager/Staff) can't be deleted." }, { status: 403 });
  }
  const actorMaxRank = await getUserMaxRank(auth.user.id);
  if (!canActorManage(actorMaxRank, existing.rank)) {
    return NextResponse.json({ error: "You can't delete a role at or above your own rank" }, { status: 403 });
  }

  // Collect who holds this role before the cascade delete wipes their
  // user_roles rows, so each of them can have their derived
  // profiles.is_admin/role tier recomputed afterward — otherwise a
  // deleted role's members would keep whatever tier they last had.
  const { data: affectedMembers } = await supabaseAdmin.from("user_roles").select("user_id").eq("role_id", params.id);

  const { error } = await supabaseAdmin.from("roles").delete().eq("id", params.id);
  if (error) {
    return safeErrorResponse("admin.roles.delete", error, "Failed to delete role");
  }

  for (const member of affectedMembers ?? []) {
    await supabaseAdmin.rpc("recompute_profile_tier", { p_user_id: member.user_id });
  }

  await logAudit({
    actorId: auth.user.id,
    actorLabel: auth.user.email ?? auth.user.id,
    entityType: "profile",
    entityId: params.id,
    action: "delete",
    before: existing,
  });
  await notify("role_deleted", `Role deleted: ${existing.name}`, "", {
    actorLabel: auth.user.email ?? auth.user.id,
  });

  return NextResponse.json({ ok: true });
}
