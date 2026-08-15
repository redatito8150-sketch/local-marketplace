import { resendClient, EMAIL_FROM } from "@/lib/email/resendClient";
import { logError } from "@/lib/errorLog";

// Mirrors notify()/logAudit()'s exact fire-and-forget contract — email is
// supplementary to the real write path it's attached to (an order being
// placed, shipped, or cancelled), so a delivery failure is logged, never
// thrown, and never blocks that write.
//
// CORRECTIVE PASS: the return type changed from `Promise<void>` to a real
// `{ok, error?}` result. Every pre-existing call site awaits this without
// reading the return value, so nothing breaks — but a caller that DOES
// need to know whether delivery actually succeeded (lib/backInStock.ts's
// durable claim/retry flow) now can, instead of a failure being
// indistinguishable from success because this function never throws.
export async function sendEmail({
  to,
  subject,
  html,
  idempotencyKey,
}: {
  to: string;
  subject: string;
  html: string;
  idempotencyKey?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!resendClient) {
    const message = "RESEND_API_KEY is not configured";
    logError(`sendEmail(${subject}) skipped`, message);
    return { ok: false, error: message };
  }

  try {
    const { error } = await resendClient.emails.send(
      {
        from: EMAIL_FROM,
        to,
        subject,
        html,
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    if (error) {
      logError(`sendEmail(${subject}) to ${to} failed`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(`sendEmail(${subject}) to ${to} threw`, message);
    return { ok: false, error: message };
  }
}
