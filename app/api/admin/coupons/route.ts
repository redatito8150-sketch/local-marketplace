import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateCouponInput, type CouponInput } from "@/lib/admin/couponValidation";
import { logAudit } from "@/lib/auditLog";

export async function POST(request: NextRequest) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: CouponInput = await request.json();
  const validationError = validateCouponInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const code = body.code.trim().toUpperCase();
  const { error } = await supabaseAdmin.from("coupons").insert({
    code,
    discount_type: body.discountType,
    discount_value: body.discountValue,
    max_uses: body.maxUses ?? null,
    expires_at: body.expiresAt || null,
    active: body.active,
  });

  if (error) {
    const message =
      error.code === "23505" /* unique_violation */
        ? `A coupon with code "${code}" already exists`
        : `Failed to create coupon: ${error.message}`;
    return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 500 });
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "coupon",
    entityId: code,
    action: "create",
    after: body,
  });

  return NextResponse.json({ code });
}
