import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  _request: Request,
  props: { params: Promise<{ pageKey: string; version: string }> }
) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { pageKey, version: rawVersion } = await props.params;
  const version = Number(rawVersion);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: "Invalid version" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.rpc("restore_page_version_to_draft", {
    p_page_key: pageKey,
    p_version: version,
    p_actor_id: staff.user.id,
    p_actor_label: staff.user.email ?? staff.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  revalidatePath(`/admin/page-studio/${pageKey}`);
  return NextResponse.json({ ok: true });
}
