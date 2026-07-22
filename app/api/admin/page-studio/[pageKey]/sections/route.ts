import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ADDABLE_PAGE_SECTION_TYPES, PAGE_SECTION_REGISTRY, type PageSectionType } from "@/lib/pageStudio/registry";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, props: { params: Promise<{ pageKey: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { pageKey } = await props.params;
  if (pageKey !== "home") return NextResponse.json({ error: "Unsupported page" }, { status: 404 });
  const body = await request.json().catch(() => null) as { sectionType?: unknown } | null;
  const sectionType = body?.sectionType as PageSectionType;
  if (!ADDABLE_PAGE_SECTION_TYPES.includes(sectionType)) {
    return NextResponse.json({ error: "Unsupported section type" }, { status: 400 });
  }
  const { data: sectionId, error } = await supabaseAdmin.rpc("create_page_section_draft", {
    p_page_key: pageKey,
    p_section_type: sectionType,
    p_config: PAGE_SECTION_REGISTRY[sectionType].defaultConfig,
    p_actor_id: staff.user.id,
    p_actor_label: staff.user.email ?? staff.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath(`/admin/page-studio/${pageKey}`);
  revalidatePath(`/admin/page-studio/${pageKey}/edit`);
  return NextResponse.json({ ok: true, sectionId }, { status: 201 });
}
