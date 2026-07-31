import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { getApplicationForAdmin } from "@/lib/data/admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { applicationBrandCreatedEmail } from "@/lib/email/templates/brandApplication";
import { logError } from "@/lib/errorLog";
import type { BrandInput } from "@/lib/admin/brandValidation";
import { slugify, baseSkuPrefix, slugVariant, skuVariant } from "@/lib/admin/brandAutoDerive";

// Same friendly-message map as /api/admin/brands' sourceApplicationId
// branch — this route calls the exact same RPC, just with auto-derived
// values instead of an admin-typed form.
const CONVERSION_ERROR_MESSAGES: Record<string, string> = {
  APPLICATION_NOT_FOUND: "The source application could not be found.",
  ALREADY_CONVERTED: "This application has already been converted to a brand.",
  NOT_APPROVED: "The source application must be approved before creating a brand from it.",
  MISSING_SLUG: "A slug is required.",
  MISSING_SKU_PREFIX: "A SKU prefix is required.",
  INVALID_SKU_PREFIX: "The SKU prefix must contain 2–6 uppercase letters or numbers.",
  APPLICATION_HAS_NO_OWNER: "This legacy application has no linked user account and cannot be converted automatically.",
  CONVERSION_LINK_BROKEN: "This application was converted but its brand link is missing.",
};

// One neutral placeholder image, reused for hero/about/story — the brand
// owner is expected to replace all of these from /brand-portal/brand-content
// once they sign in; nothing here is meant to stay live long-term.
const PLACEHOLDER_IMAGE = "/images/join/brand-story/brand-photoshoot.png";

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const application = await getApplicationForAdmin(params.id);
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }
  if (application.status !== "approved" && application.status !== "approved_pending_creation") {
    return NextResponse.json({ error: "The application must be approved first" }, { status: 400 });
  }
  if (application.approvedBrandId) {
    return NextResponse.json({ error: "This application has already been converted to a brand" }, { status: 409 });
  }

  const slugBase = slugify(application.brandName);
  const skuBase = baseSkuPrefix(application.brandName);

  // Resolve a free slug + SKU prefix pair before calling the RPC — the RPC
  // itself doesn't distinguish which of the two unique constraints failed
  // in its error message, so checking both up front (rather than
  // insert-and-parse-the-error) is the only way to know which one to bump.
  let slug = slugBase;
  let skuPrefix = skuBase;
  let resolved = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidateSlug = slugVariant(slugBase, attempt);
    const candidateSku = skuVariant(skuBase, attempt);
    const { data: conflicts } = await supabaseAdmin
      .from("brands")
      .select("slug, sku_prefix")
      .or(`slug.eq.${candidateSlug},sku_prefix.eq.${candidateSku}`);
    if (!conflicts || conflicts.length === 0) {
      slug = candidateSlug;
      skuPrefix = candidateSku;
      resolved = true;
      break;
    }
  }
  if (!resolved) {
    return NextResponse.json(
      { error: "Couldn't find an available slug/SKU prefix automatically — create this brand manually instead." },
      { status: 409 }
    );
  }

  const brandInput: BrandInput & { sourceApplicationId: string } = {
    sourceApplicationId: application.id,
    slug,
    name: application.brandName,
    tagline: "New on Mahaly",
    category: application.productCategory || "General",
    skuPrefix,
    isActive: false,
    city: application.city || "Cairo",
    heroImage: PLACEHOLDER_IMAGE,
    aboutDescription: application.brandStory,
    aboutImage: PLACEHOLDER_IMAGE,
    storyImage: PLACEHOLDER_IMAGE,
    storyBody: application.brandStory,
    infoBadges: [],
    categoryTabs: [],
    activeTab: "shop-all",
    values: [],
    similarBrandSlugs: [],
    shopTheLook: [],
  };

  const { data: resultSlug, error: rpcError } = await supabaseAdmin.rpc("convert_application_to_brand", {
    p_application_id: application.id,
    p_admin_user_id: admin.id,
    p_brand: brandInput,
  });

  if (rpcError) {
    const friendly = CONVERSION_ERROR_MESSAGES[rpcError.message];
    if (!friendly) logError("admin.applications.create-brand", rpcError.message);
    const status = rpcError.message === "ALREADY_CONVERTED" ? 409 : 400;
    return NextResponse.json({ error: friendly ?? "Failed to create brand" }, { status });
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "brand",
    entityId: resultSlug as string,
    action: "create",
    after: brandInput,
  });
  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "application",
    entityId: application.id,
    action: "convert_to_brand",
    after: { approvedBrandId: resultSlug },
  });

  const convertedApplication = await getApplicationForAdmin(application.id);
  if (convertedApplication) {
    await sendEmail({ to: convertedApplication.email, ...applicationBrandCreatedEmail(convertedApplication) });
  }

  return NextResponse.json({ slug: resultSlug });
}
