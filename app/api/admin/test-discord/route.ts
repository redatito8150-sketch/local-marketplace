import { NextResponse } from "next/server";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { logError } from "@/lib/errorLog";

// Lets an admin self-diagnose the Discord #errors webhook from the
// dashboard, without needing a real failure to test against — mirrors
// the existing /api/admin/test-email route's shape exactly.
export async function POST() {
  const staff = await requireStaffRole("admin");
  if (!staff) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  logError(
    "admin.test-discord",
    `Test message triggered from the Mahaly admin dashboard by ${staff.user.email ?? staff.user.id} — if you're reading this in #errors, the DISCORD_WEBHOOK_ERRORS webhook is configured correctly.`
  );

  return NextResponse.json({ ok: true });
}
