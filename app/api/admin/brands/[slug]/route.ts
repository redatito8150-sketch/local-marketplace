import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateBrandInput, type BrandInput } from "@/lib/admin/brandValidation";
import { logAudit } from "@/lib/auditLog";
import { safeErrorResponse } from "@/lib/apiError";

export async function PATCH(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
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
  //
  // hero/logo/about images, about description, and tagline are NOT part of
  // this update — BrandForm no longer collects them (they're edited live on
  // the brand page via InlineEditableImage/RichTextEditableField), so this
  // route must never touch those columns or it would silently wipe them.
  const { error } = await supabaseAdmin
    .from("brands")
    .update({
      name: body.name,
      category: body.category,
      additional_categories: body.additionalCategories ?? [],
      sku_prefix: body.skuPrefix.trim().toUpperCase(),
      is_active: body.isActive ?? true,
      is_mahaly_partner: body.isMahalyPartner ?? false,
      is_sponsored: body.isSponsored ?? false,
      sponsored_placements: body.sponsoredPlacements ?? [],
      sponsored_order: body.sponsoredOrder ?? null,
      founded_year: body.foundedYear ?? null,
      city: body.city,
      story_body: body.storyBody,
      shipping_policy: body.shippingPolicy?.trim() || null,
      return_policy: body.returnPolicy?.trim() || null,
      return_window_days: body.returnWindowDays ?? null,
    })
    .eq("slug", params.slug);

  if (error) {
    // The DB trigger's own message is already clear and user-facing —
    // pass it through as-is instead of wrapping it in a generic message.
    if (error.message.includes("SKU prefix cannot be changed")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return safeErrorResponse("admin.brands.update", error, "Failed to update brand", 400);
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

export async function DELETE(_request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
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
    return safeErrorResponse("admin.brands.delete", error, "Failed to delete brand");
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
