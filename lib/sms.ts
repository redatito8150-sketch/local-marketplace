// Provider-neutral server-to-server SMS adapter. Production stays disabled
// unless every required setting is present; OTPs are never written to logs.
const endpoint = process.env.SMS_PROVIDER_ENDPOINT;
const token = process.env.SMS_PROVIDER_TOKEN;
const requested = process.env.SMS_VERIFICATION_ENABLED === "true";

export const SMS_VERIFICATION_ENABLED = Boolean(
  requested && endpoint?.startsWith("https://") && token && process.env.PHONE_OTP_PEPPER
);

export async function sendSms(phone: string, message: string): Promise<void> {
  if (!SMS_VERIFICATION_ENABLED || !endpoint || !token) {
    throw new Error("SMS verification provider is not configured");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: phone, message }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`SMS provider rejected request (${response.status})`);
}
