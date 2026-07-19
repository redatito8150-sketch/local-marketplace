import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import type { StaffRole } from "@/types";

const STAFF_ROLES: StaffRole[] = ["staff", "manager", "admin"];
const ACCESS_LEVELS = ["customer", "brand_owner", "staff", "manager", "admin"] as const;
type AccessLevel = (typeof ACCESS_LEVELS)[number];

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

  // Unified Access control (Users page): one selector covering the full
  // Customer/Brand Owner/Staff/Manager/Admin spectrum, replacing the need
  // to juggle the isAdmin + role + brand-link controls separately.
  if (typeof body.access === "string") {
    const staffCheck = await requireStaffRole("admin");
    if (!staffCheck) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const access = body.access as AccessLevel;
    if (!ACCESS_LEVELS.includes(access)) {
      return NextResponse.json({ error: "Invalid access level" }, { status: 400 });
    }

    if (params.id === admin.id && access !== "admin") {
      return NextResponse.json(
        { error: "You can't remove your own admin access" },
        { status: 400 }
      );
    }

    // Access changes are always a clean state transition — a brand link
    // left over from a previous "Brand Owner" assignment must never
    // survive a move to a different access level.
    const { data: ownedBrand } = await supabaseAdmin
      .from("brands")
      .select("slug")
      .eq("owner_user_id", params.id)
      .maybeSingle();

    if (ownedBrand && (access !== "brand_owner" || ownedBrand.slug !== body.brandSlug)) {
      await supabaseAdmin
        .from("brands")
        .update({ owner_user_id: null })
        .eq("slug", ownedBrand.slug);
    }

    if (access === "brand_owner") {
      if (!body.brandSlug) {
        return NextResponse.json({ error: "Select a brand" }, { status: 400 });
      }
      const { error: linkError } = await supabaseAdmin
        .from("brands")
        .update({ owner_user_id: params.id })
        .eq("slug", body.brandSlug);

      if (linkError) {
        const message =
          linkError.code === "23505" /* unique_violation on the partial index */
            ? "That brand is already linked to another account"
            : `Failed to link brand: ${linkError.message}`;
        return NextResponse.json(
          { error: message },
          { status: linkError.code === "23505" ? 409 : 500 }
        );
      }
    }

    const isAdmin = access === "staff" || access === "manager" || access === "admin";
    const role = access;

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
      after: { access, brandSlug: access === "brand_owner" ? body.brandSlug : null },
    });

    return NextResponse.json({ id: params.id, access });
  }

  return NextResponse.json({ error: "isAdmin, role, or access is required" }, { status: 400 });
}
