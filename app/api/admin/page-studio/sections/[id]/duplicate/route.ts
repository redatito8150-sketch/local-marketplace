import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PAGE_SECTION_REGISTRY, type PageSectionType } from "@/lib/pageStudio/registry";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await props.params;
  const { data: section, error: readError } = await supabaseAdmin
    .from("page_sections")
    .select("page_key, section_type, draft_deleted")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!section || section.draft_deleted) return NextResponse.json({ error: "Page section not found" }, { status: 404 });
  const sectionType = section.section_type as PageSectionType;
  if (!PAGE_SECTION_REGISTRY[sectionType]?.canDuplicate) {
    return NextResponse.json({ error: "This section cannot be duplicated" }, { status: 400 });
  }
  const { data: sectionId, error } = await supabaseAdmin.rpc("duplicate_page_section_draft", {
    p_section_id: id,
    p_actor_id: staff.user.id,
    p_actor_label: staff.user.email ?? staff.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath(`/admin/page-studio/${section.page_key}`);
  revalidatePath(`/admin/page-studio/${section.page_key}/edit`);
  return NextResponse.json({ ok: true, sectionId }, { status: 201 });
}
