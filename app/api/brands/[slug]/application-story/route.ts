import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

// Backs the About page's "Import from your application" button — lets an
// owner/admin pull the story text they originally wrote when applying to
// join Mahaly (brand_applications.brand_story) into the editable
// aboutDescription field as a starting point, instead of writing it from
// scratch. Read-only and on-demand (never eagerly fetched, never shown to
// a public visitor) — brands.source_application_id is the real link,
// added when the application was converted (see
// 20260730000010_rebuild_brand_application_contract.sql).
export async function GET(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;

  const admin = await requireAdminUser();
  const owner = admin ? null : await requireBrandOwner();
  const isEditor = Boolean(admin) || (owner && owner.brandSlug === params.slug && owner.accessLevel === "owner");
  if (!isEditor) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: brand, error: brandError } = await supabaseAdmin
    .from("brands")
    .select("source_application_id")
    .eq("slug", params.slug)
    .maybeSingle();

  if (brandError) {
    return safeErrorResponse("brands.application-story.lookup", brandError, "Failed to load");
  }
  if (!brand?.source_application_id) {
    return NextResponse.json({ error: "No linked application" }, { status: 404 });
  }

  const { data: application, error: applicationError } = await supabaseAdmin
    .from("brand_applications")
    .select("brand_story")
    .eq("id", brand.source_application_id)
    .maybeSingle();

  if (applicationError) {
    return safeErrorResponse("brands.application-story.fetch", applicationError, "Failed to load");
  }
  if (!application?.brand_story) {
    return NextResponse.json({ error: "No story on file" }, { status: 404 });
  }

  return NextResponse.json({ story: application.brand_story });
}
