import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

// profiles/wishlists/addresses/recently_viewed/brand_follows all cascade on
// delete; orders.user_id is ON DELETE SET NULL, so past orders survive
// anonymized rather than vanishing from admin/brand-portal order history.
export async function POST() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (error) {
    return safeErrorResponse("account.delete", error);
  }
  return NextResponse.json({ ok: true });
}
