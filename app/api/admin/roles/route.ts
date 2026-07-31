import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/permissions";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAllRoles, getAllPermissions } from "@/lib/data/roles";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { safeErrorResponse } from "@/lib/apiError";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET() {
  const auth = await requirePermission("manage_roles");
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const [roles, permissions] = await Promise.all([getAllRoles(), getAllPermissions()]);
  return NextResponse.json({ roles, permissions });
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("manage_roles");
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-roles-create:${auth.user.id}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const color = typeof body?.color === "string" && body.color.trim() ? body.color.trim() : null;
  if (!name) {
    return NextResponse.json({ error: "A role name is required" }, { status: 400 });
  }
  if (name.length > 50) {
    return NextResponse.json({ error: "Role name must be 50 characters or fewer" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("roles")
    .insert({ name, description, color, is_protected: false })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `A role named "${name}" already exists` }, { status: 409 });
    }
    return safeErrorResponse("admin.roles.create", error, "Failed to create role");
  }

  await logAudit({
    actorId: auth.user.id,
    actorLabel: auth.user.email ?? auth.user.id,
    entityType: "profile",
    entityId: data.id,
    action: "create",
    after: { name, description, color },
  });
  await notify("role_created", `New role created: ${name}`, description, {
    entityId: data.id,
    entityIdLabel: "Role ID",
    actorLabel: auth.user.email ?? auth.user.id,
  });

  return NextResponse.json({ id: data.id });
}
