import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return safeErrorResponse("account.sessions.revoke", error);
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
