import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Marks every unread notification as read.
export async function PATCH() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read: true })
    .eq("read", false);

  if (error) {
    return NextResponse.json(
      { error: `Failed to mark notifications read: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
