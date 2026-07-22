import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getDraftPageSections } from "@/lib/data/pageStudio";
import { validatePageSectionConfig } from "@/lib/pageStudio/registry";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(_request: Request, props: { params: Promise<{ pageKey: string }> }) {
  const staff = await requireStaffRole("manager");
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { pageKey } = await props.params;
  const sections = await getDraftPageSections(pageKey).catch(() => null);
  if (!sections?.length) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  for (const section of sections) {
    const validationError = validatePageSectionConfig(section.sectionType, section.config);
    if (validationError) {
      return NextResponse.json(
        { error: `${section.sectionKey}: ${validationError}` },
        { status: 400 }
      );
    }
  }

  const { data: version, error } = await supabaseAdmin.rpc("publish_page_draft", {
    p_page_key: pageKey,
    p_actor_id: staff.user.id,
    p_actor_label: staff.user.email ?? staff.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/");
  revalidatePath(`/admin/page-studio/${pageKey}`);
  return NextResponse.json({ ok: true, version });
}
