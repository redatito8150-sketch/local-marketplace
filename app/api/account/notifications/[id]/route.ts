import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/requestUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("user_notifications")
    .update({ read: true })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return safeErrorResponse("account.notifications.mark-read", error, "Failed to mark notification read");
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
