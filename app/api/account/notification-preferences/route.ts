import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/requestUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import type { NotificationPreferences } from "@/types";

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { data } = await supabaseAdmin.from("profiles").select("notification_preferences").eq("id", user.id).maybeSingle();
  return NextResponse.json({ preferences: data?.notification_preferences ?? { orderUpdates: true, promotions: false, newsletter: false } });
}

export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const body: NotificationPreferences = await request.json();
  const preferences: NotificationPreferences = {
    orderUpdates: Boolean(body.orderUpdates),
    promotions: Boolean(body.promotions),
    newsletter: Boolean(body.newsletter),
  };

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ notification_preferences: preferences })
    .eq("id", user.id);

  if (error) {
    return safeErrorResponse("account.notification-preferences.update", error);
  }
  return NextResponse.json({ ok: true });
}
