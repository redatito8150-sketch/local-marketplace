import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import type { ProductTaxonomyContent } from "@/types";

function validate(value: Partial<ProductTaxonomyContent>): string | null {
  if (!Array.isArray(value.categories) || value.categories.length === 0) {
    return "At least one category is required";
  }
  if (!value.typesByCategory || typeof value.typesByCategory !== "object") {
    return "Product types are required";
  }
  if (!Array.isArray(value.collections)) return "Collections must be a list";
  if (!Array.isArray(value.materials)) return "Materials must be a list";
  if (!Array.isArray(value.fits)) return "Fits must be a list";
  return null;
}

// Whole-blob save (like category-heroes) rather than per-item routes — the
// admin editor sends the complete taxonomy every time, simplest possible
// shape for five interrelated lists (types are keyed by category).
export async function PUT(request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const validationError = validate(body.value ?? {});
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("site_content")
    .select("value")
    .eq("key", "product_taxonomy")
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("site_content")
    .upsert({ key: "product_taxonomy", value: body.value, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json(
      { error: `Failed to save: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "site_content",
    entityId: "product_taxonomy",
    action: existing ? "update" : "create",
    before: existing?.value,
    after: body.value,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin
    .from("site_content")
    .select("value")
    .eq("key", "product_taxonomy")
    .maybeSingle();

  const { error } = await supabaseAdmin.from("site_content").delete().eq("key", "product_taxonomy");
  if (error) {
    return NextResponse.json(
      { error: `Failed to reset: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "site_content",
    entityId: "product_taxonomy",
    action: "delete",
    before: existing?.value,
  });

  return NextResponse.json({ ok: true });
}
