import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PAGE_SECTION_TYPES, validatePageSectionConfig, type PageSectionType } from "@/lib/pageStudio/registry";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await props.params;
  const { data: section, error: readError } = await supabaseAdmin
    .from("page_sections")
    .select("page_key, section_type")
    .eq("id", id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!section) return NextResponse.json({ error: "Page section not found" }, { status: 404 });

  const body = await request.json().catch(() => null) as { config?: unknown; visible?: unknown } | null;
  const sectionType = section.section_type as PageSectionType;
  if (!PAGE_SECTION_TYPES.includes(sectionType)) {
    return NextResponse.json({ error: "Unsupported section type" }, { status: 400 });
  }
  const validationError = validatePageSectionConfig(sectionType, body?.config);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (typeof body?.visible !== "boolean") {
    return NextResponse.json({ error: "Visibility must be true or false" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.rpc("save_page_section_draft", {
    p_section_id: id,
    p_config: body.config,
    p_visible: body.visible,
    p_actor_id: staff.user.id,
    p_actor_label: staff.user.email ?? staff.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath(`/admin/page-studio/${section.page_key}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { id } = await props.params;
  const { data: pageKey, error } = await supabaseAdmin.rpc("delete_page_section_draft", {
    p_section_id: id,
    p_actor_id: staff.user.id,
    p_actor_label: staff.user.email ?? staff.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: error.message.includes("Required") ? 400 : 500 });
  revalidatePath(`/admin/page-studio/${pageKey}`);
  revalidatePath(`/admin/page-studio/${pageKey}/edit`);
  return NextResponse.json({ ok: true });
}
