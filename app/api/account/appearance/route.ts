import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isAccountTheme } from "@/lib/account/themes";
import { safeErrorResponse } from "@/lib/apiError";
import type { NotificationPreferences } from "@/types";

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!isAccountTheme(body?.theme)) {
    return NextResponse.json({ error: "Unknown account theme" }, { status: 400 });
  }

  const { data: profile, error: readError } = await supabaseAdmin
    .from("profiles")
    .select("notification_preferences")
    .eq("id", user.id)
    .maybeSingle();

  if (readError) return safeErrorResponse("account.appearance.read", readError);

  const current = (profile?.notification_preferences ?? {}) as Partial<NotificationPreferences>;
  const preferences: NotificationPreferences = {
    orderUpdates: current.orderUpdates ?? true,
    promotions: current.promotions ?? false,
    newsletter: current.newsletter ?? false,
    accountTheme: body.theme,
  };

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ notification_preferences: preferences })
    .eq("id", user.id);

  if (error) return safeErrorResponse("account.appearance.update", error);
  return NextResponse.json({ ok: true, theme: body.theme });
}
