import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { notify } from "@/lib/notify";
import { checkRateLimit } from "@/lib/rateLimit";
import { adminEmergencyHideProduct } from "@/lib/admin/productDeletion";

// Admin's separate emergency control: hide a product from the storefront
// immediately regardless of any active deletion-schedule state. Retires
// (never deletes) transactionally, requires a reason, and is never
// presented as permanent deletion — see admin_emergency_hide_product in
// supabase/migrations/20260814020000_product_deletion_lifecycle.sql.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`admin-product-emergency-hide:${staff.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "A reason is required to hide a product." }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin.from("products").select("*").eq("id", params.id).maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const result = await adminEmergencyHideProduct(params.id, staff.user.id, staff.user.email ?? staff.user.id, reason);
  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "PRODUCT_NOT_FOUND" ? 404 : 400 });
  }

  const auditLogId = await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "product",
    entityId: params.id,
    action: "product_emergency_hidden",
    before: existing,
    after: { reason },
    brandSlug: existing.brand_slug ?? undefined,
  });

  await notify(
    "product_emergency_hidden",
    `Product hidden by admin: ${existing.name}`,
    reason,
    {
      relatedEntityType: "product",
      relatedEntityId: params.id,
      auditLogId,
      actorLabel: staff.user.email ?? staff.user.id,
    }
  );

  return NextResponse.json({ ok: true, code: result.code, message: result.message, lifecycle: result.lifecycle });
}
