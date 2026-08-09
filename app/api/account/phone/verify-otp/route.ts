import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { SMS_VERIFICATION_ENABLED } from "@/lib/sms";
import { safeErrorResponse } from "@/lib/apiError";
import { hashPhoneOtp } from "@/lib/account/phoneVerification";

type VerificationResult = { status: "missing" | "expired" | "locked" | "incorrect" | "verified"; phone?: string };

export async function POST(request: NextRequest) {
  if (!SMS_VERIFICATION_ENABLED) {
    return NextResponse.json({ error: "Phone verification isn't available yet" }, { status: 501 });
  }
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!checkRateLimit(`phone-verify-otp:${getClientIp(request)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again later" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the 6-digit verification code" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("verify_phone_otp", {
    p_user_id: user.id,
    p_otp_hash: hashPhoneOtp(code),
    p_max_attempts: 5,
  });
  if (error) return safeErrorResponse("account.phone.verify-otp", error);
  const result = data as VerificationResult;
  if (result.status === "verified") return NextResponse.json({ ok: true, phone: result.phone });
  if (result.status === "locked") return NextResponse.json({ error: "Too many incorrect attempts — request a new code" }, { status: 429 });
  if (result.status === "expired") return NextResponse.json({ error: "This code has expired — request a new one" }, { status: 400 });
  if (result.status === "missing") return NextResponse.json({ error: "Request a new code first" }, { status: 400 });
  return NextResponse.json({ error: "That code isn't correct" }, { status: 400 });
}
