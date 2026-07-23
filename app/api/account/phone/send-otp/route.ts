import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { SMS_VERIFICATION_ENABLED, sendSms } from "@/lib/sms";
import { safeErrorResponse } from "@/lib/apiError";

const OTP_TTL_MS = 10 * 60 * 1000;

function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

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
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!phone) {
    return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const { error } = await supabaseAdmin.from("phone_verifications").insert({
    user_id: user.id,
    phone,
    otp_hash: hashOtp(code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  });

  if (error) {
    return safeErrorResponse("account.phone.send-otp", error);
  }

  await sendSms(phone, `Your Mahaly verification code is ${code}. It expires in 10 minutes.`);
  return NextResponse.json({ ok: true });
}
