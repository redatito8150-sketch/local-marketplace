import { NextRequest, NextResponse } from "next/server";
import { requireActiveBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateBrandInput, type BrandInput } from "@/lib/admin/brandValidation";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";

// Unlike products, brand page content applies instantly — the confirmed
// design decision is that the admin just gets notified to spot-check it
// afterwards, not gated behind a review queue. Owner-only: assistants get a
// narrower slice of the portal and the brand-portal nav never links here
// for them (Round 3 Phase 5); an admin viewing via impersonation can preview
// this page but never writes on the brand's behalf, same rule as every
// other brand-portal write path.
export async function PATCH(request: NextRequest) {
  const owner = await requireActiveBrandOwner();
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
  // Name is admin-only (same rule enforced on the public brand page's own
  // inline-edit route) — the brand-portal form disables the field, but
  // never trust that alone; the update below simply never writes name.

  const validationError = validateBrandInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // hero/logo/about images, about description, and tagline are edited live
  // on the brand page (InlineEditableImage/RichTextEditableField) now, not
  // through this form — never touch those columns here or a save would
  // silently wipe them. This is also exactly why before/after below are
  // scoped to just these 8 fields rather than the whole row: comparing the
  // full `brands` row (which has ~20 columns) against this narrow payload
  // used to make every untouched column — hero_image, logo, is_active,
  // sponsored*, etc. — show up as a phantom "removed" change in the
  // Discord/Audit Log diff, even though the UPDATE below never touches
  // them. Matches the already-correct narrow-select pattern in
  // app/api/brands/[slug]/inline-edit/route.ts.
  const updatePayload = {
    category: body.category,
    additional_categories: body.additionalCategories ?? [],
    founded_year: body.foundedYear ?? null,
    city: body.city,
    story_body: body.storyBody,
    shipping_policy: body.shippingPolicy?.trim() || null,
    return_policy: body.returnPolicy?.trim() || null,
    return_window_days: body.returnWindowDays ?? null,
  };

  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select(Object.keys(updatePayload).join(", "))
    .eq("slug", owner.brandSlug)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("brands")
    .update(updatePayload)
    .eq("slug", owner.brandSlug);

  if (error) {
    return safeErrorResponse("brand-portal.brand-content.update", error, "Failed to update brand page");
  }

  await logAudit({
    actorId: owner.user.id,
    actorLabel: owner.user.email ?? owner.user.id,
    entityType: "brand",
    entityId: owner.brandSlug,
    action: "update",
    before: existing,
    after: updatePayload,
    brandSlug: owner.brandSlug,
  });
  await notify("brand_updated", `Brand page updated: ${body.name}`, "", {
    relatedEntityType: "brand",
    relatedEntityId: owner.brandSlug,
    entityIdLabel: "Brand ID",
    actorLabel: owner.user.email ?? owner.user.id,
  });

  return NextResponse.json({ slug: owner.brandSlug });
}
