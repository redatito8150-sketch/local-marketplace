import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from("notifications")
    .update({ read: true })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to mark notification read: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
