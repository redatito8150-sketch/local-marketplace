import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ sessions: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("user_sessions")
    .select("id, device_id, user_agent, last_seen_at, created_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false });

  if (error) {
    return safeErrorResponse("account.sessions.list", error);
  }
  return NextResponse.json({ sessions: data ?? [] });
}
