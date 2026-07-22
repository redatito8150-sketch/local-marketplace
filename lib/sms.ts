// Phone-verification SMS delivery. Real providers (Twilio, Vonage,
// MessageBird...) all need their own account + credentials, which this
// project doesn't have configured — so this stays a single, clearly-marked
// integration point rather than guessing at one provider's SDK.
//
// SMS_VERIFICATION_ENABLED=false (or unset, the default) means the whole
// phone-verification feature is off: send-otp/verify-otp both respond with
// a clear "not configured" error and the security page hides the OTP form
// entirely, same "no-op if unset" convention as lib/discord.ts. Flipping it
// to "true" without wiring a real provider here just logs the OTP to the
// server console instead of sending it — fine for local testing, not for
// production.
export const SMS_VERIFICATION_ENABLED = process.env.SMS_VERIFICATION_ENABLED === "true";

export async function sendSms(phone: string, message: string): Promise<void> {
  if (!SMS_VERIFICATION_ENABLED) return;

  // TODO: call a real SMS provider here (Twilio/Vonage/MessageBird) once
  // one is configured for this project. Until then, log instead of sending
  // so phone verification is still testable locally.
  console.warn(`[sms] No SMS provider configured — would send to ${phone}: ${message}`);
}
