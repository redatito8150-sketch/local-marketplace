import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/requestUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { getNotificationsForUser } from "@/lib/data/userNotifications";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const notifications = await getNotificationsForUser(user.id);
  return NextResponse.json({ notifications });
}

// Marks every one of the caller's own unread notifications as read.
export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { error } = await supabaseAdmin
    .from("user_notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);

  if (error) {
    return safeErrorResponse("account.notifications.mark-all-read", error, "Failed to mark notifications read");
  }
  return NextResponse.json({ ok: true });
}
