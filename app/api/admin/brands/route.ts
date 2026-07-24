import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateBrandInput, type BrandInput } from "@/lib/admin/brandValidation";
import { logAudit } from "@/lib/auditLog";
import { getApplicationForAdmin } from "@/lib/data/admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { applicationBrandCreatedEmail } from "@/lib/email/templates/brandApplication";

type BrandInputWithSource = BrandInput & { sourceApplicationId?: string };

// Errors raised by convert_application_to_brand() — mapped to friendly
// messages instead of leaking the raw Postgres exception text.
const CONVERSION_ERROR_MESSAGES: Record<string, string> = {
  APPLICATION_NOT_FOUND: "The source application could not be found.",
  ALREADY_CONVERTED: "This application has already been converted to a brand.",
  NOT_APPROVED: "The source application must be approved before creating a brand from it.",
  MISSING_SLUG: "A slug is required.",
};

export async function POST(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body: BrandInputWithSource = await request.json();
  const validationError = validateBrandInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Approve → Create Brand (Milestone 6): atomic brand insert + application
  // conversion via the security-definer RPC, instead of a plain insert.
  if (body.sourceApplicationId) {
    const { data: slug, error: rpcError } = await supabaseAdmin.rpc("convert_application_to_brand", {
      p_application_id: body.sourceApplicationId,
      p_admin_user_id: admin.id,
      p_brand: body,
    });

    if (rpcError) {
      const friendly = CONVERSION_ERROR_MESSAGES[rpcError.message] ?? `Failed to create brand: ${rpcError.message}`;
      const status = rpcError.message === "ALREADY_CONVERTED" ? 409 : 400;
      return NextResponse.json({ error: friendly }, { status });
    }

    await logAudit({
      actorId: admin.id,
      actorLabel: admin.email ?? admin.id,
      entityType: "brand",
      entityId: slug as string,
      action: "create",
      after: body,
    });
    await logAudit({
      actorId: admin.id,
      actorLabel: admin.email ?? admin.id,
      entityType: "application",
      entityId: body.sourceApplicationId,
      action: "convert_to_brand",
      after: { approvedBrandId: slug },
    });

    const convertedApplication = await getApplicationForAdmin(body.sourceApplicationId);
    if (convertedApplication) {
      await sendEmail({ to: convertedApplication.email, ...applicationBrandCreatedEmail(convertedApplication) });
    }

    return NextResponse.json({ slug });
  }

  const { error } = await supabaseAdmin.from("brands").insert({
    slug: body.slug.trim(),
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
    shop_the_look: body.shopTheLook,
  });

  if (error) {
    const message =
      error.code === "23505" /* unique_violation */
        ? `A brand with slug "${body.slug}" already exists`
        : `Failed to create brand: ${error.message}`;
    return NextResponse.json({ error: message }, { status: error.code === "23505" ? 409 : 500 });
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "brand",
    entityId: body.slug.trim(),
    action: "create",
    after: body,
  });

  return NextResponse.json({ slug: body.slug.trim() });
}
