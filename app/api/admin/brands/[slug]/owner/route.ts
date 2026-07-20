import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";

export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { email } = await request.json();
  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("email", email.trim())
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: "No account found with that email — they need to sign up first" },
      { status: 404 }
    );
  }

  const { error } = await supabaseAdmin
    .from("brands")
    .update({ owner_user_id: profile.id })
    .eq("slug", params.slug);

  if (error) {
    const message =
      error.code === "23505" /* unique_violation on the partial index */
        ? "That account is already linked to another brand"
        : `Failed to link owner: ${error.message}`;
    return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 500 });
  }

  await supabaseAdmin.from("profiles").update({ role: "brand_owner" }).eq("id", profile.id);

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "brand",
    entityId: params.slug,
    action: "update",
    after: { ownerUserId: profile.id, ownerEmail: profile.email },
  });

  return NextResponse.json({ ok: true, ownerEmail: profile.email });
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("brands")
    .update({ owner_user_id: null })
    .eq("slug", params.slug);

  if (error) {
    return NextResponse.json(
      { error: `Failed to unlink owner: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "brand",
    entityId: params.slug,
    action: "update",
    after: { ownerUserId: null },
  });

  return NextResponse.json({ ok: true });
}
