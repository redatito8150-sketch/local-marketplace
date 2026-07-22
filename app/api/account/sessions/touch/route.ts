import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/rateLimit";

// Called once per device per sign-in (AuthContext, on SIGNED_IN / initial
// session) so the security page's device list has something current to
// show. device_id is a random id the browser generates once and keeps in
// localStorage — this is a self-reported registry, not a session store.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim() : "";
  if (!deviceId) {
    return NextResponse.json({ error: "Missing device id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("user_sessions").upsert(
    {
      user_id: user.id,
      device_id: deviceId,
      user_agent: request.headers.get("user-agent") ?? null,
      ip_address: getClientIp(request),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id,device_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
