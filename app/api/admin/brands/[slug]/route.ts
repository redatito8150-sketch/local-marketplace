import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateBrandInput, type BrandInput } from "@/lib/admin/brandValidation";
import { logAudit } from "@/lib/auditLog";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: BrandInput = await request.json();
  const validationError = validateBrandInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  // Slug is the primary key and the /brands/[slug] URL — it's locked in the
  // UI, and ignored here even if a caller sends a different value, so a
  // rename can never silently orphan a product's brand_slug.
  const { error } = await supabaseAdmin
    .from("brands")
    .update({
      name: body.name,
      tagline: body.tagline,
      category: body.category,
      founded_year: body.foundedYear ?? null,
      city: body.city,
      hero_image: body.heroImage,
      about_description: body.aboutDescription,
      about_image: body.aboutImage,
      story_image: body.storyImage,
      story_body: body.storyBody,
      info_badges: body.infoBadges,
      category_tabs: body.categoryTabs,
      active_tab: body.activeTab || "shop-all",
      values: body.values,
      similar_brand_slugs: body.similarBrandSlugs,
    })
    .eq("slug", params.slug);

  if (error) {
    return NextResponse.json(
      { error: `Failed to update brand: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "brand",
    entityId: params.slug,
    action: "update",
    before: existing,
    after: body,
  });

  return NextResponse.json({ slug: params.slug });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("brands").delete().eq("slug", params.slug);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete brand: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "brand",
    entityId: params.slug,
    action: "delete",
    before: existing,
  });

  return NextResponse.json({ ok: true });
}
