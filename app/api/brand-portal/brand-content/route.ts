import { NextRequest, NextResponse } from "next/server";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateBrandInput, type BrandInput } from "@/lib/admin/brandValidation";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
import { checkRateLimit } from "@/lib/rateLimit";

// Unlike products, brand page content applies instantly — the confirmed
// design decision is that the admin just gets notified to spot-check it
// afterwards, not gated behind a review queue. Owner-only: assistants get a
// narrower slice of the portal and the brand-portal nav never links here
// for them (Round 3 Phase 5); an admin viewing via impersonation can preview
// this page but never writes on the brand's behalf, same rule as every
// other brand-portal write path.
export async function PATCH(request: NextRequest) {
  const owner = await requireBrandOwner();
  if (!owner || owner.isImpersonating || !owner.brandSlug || owner.accessLevel !== "owner") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`brand-portal-content-update:${owner.user.id}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body: BrandInput = await request.json();
  // Slug is the brand's fixed identity — never trust the client, even
  // though the brand-portal form doesn't render the field at all.
  body.slug = owner.brandSlug;

  const validationError = validateBrandInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("slug", owner.brandSlug)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("brands")
    .update({
      name: body.name,
      tagline: body.tagline,
      category: body.category,
      founded_year: body.foundedYear ?? null,
      city: body.city,
      hero_image: body.heroImage,
      logo_image: body.logoImage || null,
      website_url: body.websiteUrl || null,
      about_description: body.aboutDescription,
      about_image: body.aboutImage,
      story_image: body.storyImage,
      story_image_2: body.storyImage2 || null,
      story_body: body.storyBody,
      info_badges: body.infoBadges,
      category_tabs: body.categoryTabs,
      active_tab: body.activeTab || "shop-all",
      values: body.values,
      similar_brand_slugs: body.similarBrandSlugs,
      shop_the_look: body.shopTheLook ?? [],
    })
    .eq("slug", owner.brandSlug);

  if (error) {
    return NextResponse.json(
      { error: `Failed to update brand page: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "brand",
    entityId: owner.brandSlug,
    action: "update",
    before: existing,
    after: body,
    brandSlug: owner.brandSlug,
  });
  await notify("brand_updated", `Brand page updated: ${body.name}`, "", {
    entityId: owner.brandSlug,
    entityIdLabel: "Brand ID",
    actorLabel: owner.user.email ?? owner.user.id,
  });

  return NextResponse.json({ slug: owner.brandSlug });
}
