import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// Read-only check for live checkout feedback — never mutates used_count.
// The actual atomic redeem+increment happens inside place_order() at order
// creation time, so this can be called repeatedly while a customer types
// without risking a race on a limited-use code.
export async function POST(request: NextRequest) {
  if (!checkRateLimit(`coupon-validate:${getClientIp(request)}`, 20, 5 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again shortly" }, { status: 429 });
  }

  const body = await request.json();
  const code: string = (body.code ?? "").trim().toUpperCase();
  const subtotalEgp: number = Number(body.subtotalEgp) || 0;

  if (!code) {
    return NextResponse.json({ error: "Enter a code" }, { status: 400 });
  }

  const { data: coupon } = await supabaseAdmin
    .from("coupons")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!coupon) {
    return NextResponse.json({ error: "This code doesn't exist" }, { status: 404 });
  }
  if (!coupon.active) {
    return NextResponse.json({ error: "This code is no longer active" }, { status: 400 });
  }
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ error: "This code has expired" }, { status: 400 });
  }
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
    return NextResponse.json({ error: "This code has reached its usage limit" }, { status: 400 });
  }

  const discountEgp =
    coupon.discount_type === "percentage"
      ? Math.round((subtotalEgp * Number(coupon.discount_value)) / 100 * 100) / 100
      : Math.min(Number(coupon.discount_value), subtotalEgp);

  return NextResponse.json({
    valid: true,
    code,
    discountType: coupon.discount_type,
    discountValue: Number(coupon.discount_value),
    discountEgp,
  });
}
