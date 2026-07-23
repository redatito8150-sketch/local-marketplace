import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

// Marks the post-registration "add an address / skip" onboarding step
// (app/onboarding/add-address) as seen, whichever action the customer took
// — so it never shows again on a later sign-in.
export async function POST() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) {
    return safeErrorResponse("account.onboarding.complete", error);
  }
  return NextResponse.json({ ok: true });
}
