import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

// Only the plain-text profile fields — email/password go through
// supabase.auth.updateUser() directly from the client, since those are
// Supabase Auth's own domain, not a profiles-table column.
export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { fullName, phone } = await request.json();
  if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ full_name: fullName.trim(), phone: (phone ?? "").trim() })
    .eq("id", user.id);

  if (error) {
    return safeErrorResponse("account.profile.update", error);
  }
  return NextResponse.json({ ok: true });
}
