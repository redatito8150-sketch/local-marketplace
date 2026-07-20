import { resendClient, EMAIL_FROM } from "@/lib/email/resendClient";
import { logError } from "@/lib/errorLog";

// Mirrors notify()/logAudit()'s exact fire-and-forget contract — email is
// supplementary to the real write path it's attached to (an order being
// placed, shipped, or cancelled), so a delivery failure is logged, never
// thrown, and never blocks that write.
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!resendClient) {
    logError(`sendEmail(${subject}) skipped`, "RESEND_API_KEY is not configured");
    return;
  }

  const { error } = await resendClient.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  if (error) {
    logError(`sendEmail(${subject}) to ${to} failed`, error.message);
  }
}
