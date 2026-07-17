import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateBrandInput, type BrandInput } from "@/lib/admin/brandValidation";

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: BrandInput = await request.json();
  const validationError = validateBrandInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("brands").insert({
    slug: body.slug.trim(),
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
  });

  if (error) {
    const message =
      error.code === "23505" /* unique_violation */
        ? `A brand with slug "${body.slug}" already exists`
        : `Failed to create brand: ${error.message}`;
    return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 500 });
  }

  return NextResponse.json({ slug: body.slug.trim() });
}
