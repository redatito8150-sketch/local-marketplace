import { Resend } from "resend";

// Lazily constructed so a dev environment with no RESEND_API_KEY set can
// still run the rest of the app — sendEmail() checks this before use and
// no-ops with a clear log message instead of throwing.
export const resendClient = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Resend requires a verified sending domain; until one is configured this
// is the only address Resend allows sending from/to in test mode. Update
// once the owner verifies a real domain in the Resend dashboard.
export const EMAIL_FROM = "Mahaly <onboarding@resend.dev>";
