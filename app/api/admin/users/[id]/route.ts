import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";

const ACCESS_LEVELS = [
  "customer",
  "brand_owner",
  "brand_assistant",
  "staff",
  "manager",
  "admin",
] as const;
type AccessLevel = (typeof ACCESS_LEVELS)[number];

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

  if (typeof body.access !== "string") {
    return NextResponse.json({ error: "access is required" }, { status: 400 });
  }

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

  const needsBrand = access === "brand_owner" || access === "brand_assistant";
  if (needsBrand && (typeof body.brandSlug !== "string" || !body.brandSlug.trim())) {
    return NextResponse.json({ error: "Select a brand" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.rpc("set_user_access", {
    p_user_id: params.id,
    p_access: access,
    p_brand_slug: needsBrand ? body.brandSlug.trim() : null,
  });

  if (error) {
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "That brand is already linked to another account"
            : "Failed to update user access",
      },
      { status: error.code === "23505" ? 409 : 500 }
    );
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "profile",
    entityId: params.id,
    action: "role_change",
    before,
    after: {
      access,
      brandSlug: needsBrand ? body.brandSlug.trim() : null,
    },
  });

  return NextResponse.json({ id: params.id, access });
}
