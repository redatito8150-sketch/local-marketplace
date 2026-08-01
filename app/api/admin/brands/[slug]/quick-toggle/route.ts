import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { safeErrorResponse } from "@/lib/apiError";

// A lightweight single-field PATCH for the admin brands list's inline
// Active/Partner/Sponsored buttons — the full PATCH at [slug]/route.ts
// requires the entire BrandInput payload (validateBrandInput), which the
// list page doesn't have loaded, so this exists as its own minimal route.
type ToggleField = "isActive" | "isMahalyPartner" | "isSponsored";
const FIELD_TO_COLUMN: Record<ToggleField, string> = {
  isActive: "is_active",
  isMahalyPartner: "is_mahaly_partner",
  isSponsored: "is_sponsored",
};

export async function PATCH(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const field = body.field as ToggleField;
  if (!Object.prototype.hasOwnProperty.call(FIELD_TO_COLUMN, field) || typeof body.value !== "boolean") {
    return NextResponse.json({ error: "Invalid toggle request" }, { status: 400 });
  }
  const column = FIELD_TO_COLUMN[field];

  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select("id, " + column)
    .eq("slug", params.slug)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("brands")
    .update({ [column]: body.value })
    .eq("slug", params.slug);

  if (error) {
    return safeErrorResponse("admin.brands.quickToggle", error, "Failed to update brand");
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "brand",
    entityId: params.slug,
    action: "update",
    before: existing ? { [field]: (existing as unknown as Record<string, unknown>)[column] } : undefined,
    after: { [field]: body.value },
  });

  return NextResponse.json({ ok: true });
}
