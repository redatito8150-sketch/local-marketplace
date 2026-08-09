import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabase/requestUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

// Atomic swap via the set_default_address() Postgres function (Phase 0
// schema) — clears the old default and sets the new one in one statement,
// so there's never a window with zero or two defaults.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin.rpc("set_default_address", {
    p_user_id: user.id,
    p_address_id: params.id,
  });

  if (error) {
    if (error.message.includes("ADDRESS_NOT_FOUND_OR_FORBIDDEN") || error.code === "P0002") {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }
    return safeErrorResponse("account.addresses.set-default", error);
  }
  return NextResponse.json({ ok: true });
}
