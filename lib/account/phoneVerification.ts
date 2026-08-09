import crypto from "crypto";

const E164_PHONE = /^\+[1-9]\d{7,14}$/;

export function normalizeE164Phone(value: string): string | null {
  const normalized = value.replace(/[\s()-]/g, "");
  return E164_PHONE.test(normalized) ? normalized : null;
}

export function hashPhoneOtp(code: string): string {
  const pepper = process.env.PHONE_OTP_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error("PHONE_OTP_PEPPER must be configured with at least 32 characters");
  }
  return crypto.createHmac("sha256", pepper).update(code).digest("hex");
}
