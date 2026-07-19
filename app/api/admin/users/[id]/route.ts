import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import type { StaffRole } from "@/types";

const STAFF_ROLES: StaffRole[] = ["staff", "manager", "admin"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const { data: before } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, role, email")
    .eq("id", params.id)
    .maybeSingle();

  // Toggling is_admin on/off (existing behavior, unchanged).
  if (typeof body.isAdmin === "boolean") {
    const isAdmin = body.isAdmin;

    // Without this, an admin could lock themselves out with no UI path back in.
    if (params.id === admin.id && !isAdmin) {
      return NextResponse.json(
        { error: "You can't remove your own admin access" },
        { status: 400 }
      );
    }

    // Granting admin access lands the account at "staff" by default (an
    // admin can promote further); revoking it resets role to "customer" so
    // a demoted account never keeps a stale staff-level role in the DB.
    const role = isAdmin ? "staff" : "customer";
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_admin: isAdmin, role })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to update user: ${error.message}` },
        { status: 500 }
      );
    }

    await logAudit({
      actorId: admin.id,
      actorLabel: admin.email ?? admin.id,
      entityType: "profile",
      entityId: params.id,
      action: "role_change",
      before,
      after: { is_admin: isAdmin, role },
    });

    return NextResponse.json({ id: params.id, isAdmin, role });
  }

  // Changing the granular staff role — only an admin-ranked caller may do
  // this (a manager could otherwise promote themselves to admin).
  if (typeof body.role === "string") {
    const staffCheck = await requireStaffRole("admin");
    if (!staffCheck) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (!STAFF_ROLES.includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    if (params.id === admin.id && body.role !== "admin") {
      return NextResponse.json(
        { error: "You can't remove your own admin role" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ role: body.role })
      .eq("id", params.id);

    if (error) {
      return NextResponse.json(
        { error: `Failed to update user: ${error.message}` },
        { status: 500 }
      );
    }

    await logAudit({
      actorId: admin.id,
      actorLabel: admin.email ?? admin.id,
      entityType: "profile",
      entityId: params.id,
      action: "role_change",
      before,
      after: { ...before, role: body.role },
    });

    return NextResponse.json({ id: params.id, role: body.role });
  }

  return NextResponse.json({ error: "isAdmin or role is required" }, { status: 400 });
}
