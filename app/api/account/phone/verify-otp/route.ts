import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { SMS_VERIFICATION_ENABLED } from "@/lib/sms";
import { safeErrorResponse } from "@/lib/apiError";

const MAX_ATTEMPTS = 5;

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

  // The per-code attempt counter below already caps wrong guesses at
  // MAX_ATTEMPTS (persisted in the DB row, so it holds across serverless
  // instances) — this IP-keyed limit is defense-in-depth against request
  // flooding/DoS on this endpoint, not the primary brute-force guard.
  if (!checkRateLimit(`phone-verify-otp:${getClientIp(request)}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts — try again later" }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
  }

  const { data: verification, error } = await supabaseAdmin
    .from("phone_verifications")
    .select("id, phone, otp_hash, expires_at, attempts, consumed_at")
    .eq("user_id", user.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return safeErrorResponse("account.phone.verify-otp.lookup", error);
  }
  if (!verification) {
    return NextResponse.json({ error: "Request a new code first" }, { status: 400 });
  }
  if (new Date(verification.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This code has expired — request a new one" }, { status: 400 });
  }
  if (verification.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many incorrect attempts — request a new code" }, { status: 429 });
  }

  if (hashOtp(code) !== verification.otp_hash) {
    await supabaseAdmin
      .from("phone_verifications")
      .update({ attempts: verification.attempts + 1 })
      .eq("id", verification.id);
    return NextResponse.json({ error: "That code isn't correct" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("phone_verifications")
    .update({ consumed_at: now })
    .eq("id", verification.id);

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ phone: verification.phone, phone_verified_at: now })
    .eq("id", user.id);

  if (profileError) {
    return safeErrorResponse("account.phone.verify-otp.update-profile", profileError);
  }
  return NextResponse.json({ ok: true, phone: verification.phone });
}
