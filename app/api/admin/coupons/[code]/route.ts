import { NextRequest, NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateCouponInput, type CouponInput } from "@/lib/admin/couponValidation";
import { logAudit } from "@/lib/auditLog";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const code = params.code.toUpperCase();
  const body: CouponInput = await request.json();
  const validationError = validateCouponInput({ ...body, code });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("coupons")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  // Code is the primary key — locked in the UI, never renamed via this
  // route, so an order's coupon_code reference can never be orphaned.
  const { error } = await supabaseAdmin
    .from("coupons")
    .update({
      discount_type: body.discountType,
      discount_value: body.discountValue,
      max_uses: body.maxUses ?? null,
      expires_at: body.expiresAt || null,
      active: body.active,
    })
    .eq("code", code);

  if (error) {
    return NextResponse.json(
      { error: `Failed to update coupon: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "coupon",
    entityId: code,
    action: "update",
    before: existing,
    after: body,
  });

  return NextResponse.json({ code });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { code: string } }
) {
  const staff = await requireStaffRole("manager");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const code = params.code.toUpperCase();
  const { data: existing } = await supabaseAdmin
    .from("coupons")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("coupons").delete().eq("code", code);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete coupon: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: staff.user.id,
    actorLabel: staff.user.email ?? staff.user.id,
    entityType: "coupon",
    entityId: code,
    action: "delete",
    before: existing,
  });

  return NextResponse.json({ ok: true });
}
