import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/requestUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

// Only the plain-text profile fields — email/password go through
// supabase.auth.updateUser() directly from the client, since those are
// Supabase Auth's own domain, not a profiles-table column.
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { data: profile } = await supabaseAdmin.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
  return NextResponse.json({ profile: { fullName: profile?.full_name ?? "", phone: profile?.phone ?? "", email: user.email ?? "" } });
}

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
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
