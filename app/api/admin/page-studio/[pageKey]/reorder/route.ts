import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PUT(request: NextRequest, props: { params: Promise<{ pageKey: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { pageKey } = await props.params;
  const body = await request.json().catch(() => null) as { sectionIds?: unknown } | null;
  if (!Array.isArray(body?.sectionIds) || body.sectionIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "A complete section order is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.rpc("reorder_page_draft", {
    p_page_key: pageKey,
    p_section_ids: body.sectionIds,
    p_actor_id: staff.user.id,
    p_actor_label: staff.user.email ?? staff.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  revalidatePath(`/admin/page-studio/${pageKey}`);
  return NextResponse.json({ ok: true });
}
