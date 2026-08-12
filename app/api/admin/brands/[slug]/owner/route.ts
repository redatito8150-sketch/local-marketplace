import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { logError } from "@/lib/errorLog";
import { safeErrorResponse } from "@/lib/apiError";

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

  const { error } = await supabaseAdmin.rpc("set_brand_primary_owner", {
    p_brand_slug: params.slug,
    p_new_owner_id: profile.id,
  });

  if (error) {
    if (error.code === "23505" /* unique_violation on the partial index */) {
      return NextResponse.json({ error: "That account is already linked to another brand" }, { status: 409 });
    }
    logError("admin.brands.owner.link", error.message);
    return NextResponse.json({ error: "Failed to link owner" }, { status: 500 });
  }

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

export async function DELETE(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Which member to remove — a brand can have co-owners
  // (brand_staff.access_level='owner' rows) beyond the single primary
  // owner_user_id pointer, so unlinking always targets a specific account,
  // never just "whoever's primary right now". See
  // 20260812000004_brand_owner_removal.sql for why.
  const { userId } = await request.json().catch(() => ({ userId: undefined }));
  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.rpc("remove_brand_owner", {
    p_brand_slug: params.slug,
    p_user_id: userId,
  });

  if (error) {
    return safeErrorResponse("admin.brands.owner.unlink", error, "Failed to unlink owner");
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "brand",
    entityId: params.slug,
    action: "update",
    after: { removedOwnerId: userId },
  });

  return NextResponse.json({ ok: true });
}
