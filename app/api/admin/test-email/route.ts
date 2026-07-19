import { NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { sendEmail } from "@/lib/email/sendEmail";
import { emailShell } from "@/lib/email/templates/shared";

// Lets an admin self-diagnose the Resend setup from the dashboard, without
// needing a real order to test against.
export async function POST() {
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!staff.user.email) {
    return NextResponse.json({ error: "Your account has no email on file" }, { status: 400 });
  }

  await sendEmail({
    to: staff.user.email,
    subject: "LOCAL — test email",
    html: emailShell(
      `<p style="font-size: 14px;">This is a test email from your LOCAL admin dashboard — if you're reading this, Resend is configured correctly.</p>`
    ),
  });

  return NextResponse.json({ ok: true, sentTo: staff.user.email });
}
