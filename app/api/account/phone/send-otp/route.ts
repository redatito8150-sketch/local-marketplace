import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { SMS_VERIFICATION_ENABLED, sendSms } from "@/lib/sms";
import { safeErrorResponse } from "@/lib/apiError";
import { hashPhoneOtp, normalizeE164Phone } from "@/lib/account/phoneVerification";

const OTP_TTL_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  if (!SMS_VERIFICATION_ENABLED) {
    return NextResponse.json(
      { error: "Phone verification isn't available yet" },
      { status: 501 }
    );
  }

  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  if (!checkRateLimit(`phone-send-otp:${getClientIp(request)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again later" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const phone = typeof body.phone === "string" ? normalizeE164Phone(body.phone) : null;
  if (!phone) {
    return NextResponse.json({ error: "Use a valid international phone number, for example +201001234567" }, { status: 400 });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const { data: verification, error } = await supabaseAdmin.from("phone_verifications").insert({
    user_id: user.id,
    phone,
    otp_hash: hashPhoneOtp(code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  }).select("id").single();

  if (error) {
    return safeErrorResponse("account.phone.send-otp", error);
  }

  try {
    await sendSms(phone, `Your Zakhnook verification code is ${code}. It expires in 10 minutes.`);
  } catch (sendError) {
    await supabaseAdmin.from("phone_verifications").delete().eq("id", verification.id);
    return safeErrorResponse("account.phone.send-otp.provider", sendError as Error, "Phone verification is temporarily unavailable");
  }
  return NextResponse.json({ ok: true });
}
