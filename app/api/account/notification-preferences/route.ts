import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { NotificationPreferences } from "@/types";

export async function PATCH(request: NextRequest) {
  const user = await requireUser();
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
