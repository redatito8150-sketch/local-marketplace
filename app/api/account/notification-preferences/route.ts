import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import type { NotificationPreferences } from "@/types";

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const body: NotificationPreferences = await request.json();
  const { data: profile, error: readError } = await supabaseAdmin
    .from("profiles")
    .select("notification_preferences")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) {
    return safeErrorResponse("account.notification-preferences.read", readError);
  }
  const current = (profile?.notification_preferences ?? {}) as Partial<NotificationPreferences>;
  const preferences: NotificationPreferences = {
    orderUpdates: Boolean(body.orderUpdates),
    promotions: Boolean(body.promotions),
    newsletter: Boolean(body.newsletter),
    accountTheme: current.accountTheme,
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
