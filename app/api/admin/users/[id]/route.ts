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

    // A brand can have only one true owner (enforced by the partial unique
    // index above) but several assistants — brand_staff is a genuinely
    // separate junction table, not a reuse of the single owner column.
    // Same clean-state-transition rule: switching this account to a
    // different brand (or off brand_assistant entirely) drops the old link
    // first.
    const { data: staffRow } = await supabaseAdmin
      .from("brand_staff")
      .select("brand_slug")
      .eq("user_id", params.id)
      .maybeSingle();

    if (staffRow && (access !== "brand_assistant" || staffRow.brand_slug !== body.brandSlug)) {
      await supabaseAdmin.from("brand_staff").delete().eq("user_id", params.id);
    }

    if (access === "brand_assistant") {
      if (!body.brandSlug) {
        return NextResponse.json({ error: "Select a brand" }, { status: 400 });
      }
      const { error: staffLinkError } = await supabaseAdmin
        .from("brand_staff")
        .upsert(
          { brand_slug: body.brandSlug, user_id: params.id },
          { onConflict: "brand_slug,user_id" }
        );

      if (staffLinkError) {
        return NextResponse.json(
          { error: `Failed to link brand assistant: ${staffLinkError.message}` },
          { status: 500 }
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
      after: {
        access,
        brandSlug:
          access === "brand_owner" || access === "brand_assistant" ? body.brandSlug : null,
      },
    });

    return NextResponse.json({ id: params.id, access });
  }

  return NextResponse.json({ error: "access is required" }, { status: 400 });
}
