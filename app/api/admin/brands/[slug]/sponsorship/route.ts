import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/auditLog";
import { safeErrorResponse } from "@/lib/apiError";
import { SPONSOR_PLACEMENTS } from "@/lib/admin/brandValidation";

// A single-purpose PATCH for the admin brands list's inline Sponsored
// popover (BrandSponsorControl) — lets the admin flip is_sponsored and
// pick placements/order without leaving /admin/brands for the full
// BrandForm edit page.
export async function PATCH(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json();
  const isSponsored = Boolean(body.isSponsored);
  const sponsoredPlacements: string[] = Array.isArray(body.sponsoredPlacements) ? body.sponsoredPlacements : [];
  const sponsoredOrder: number | null = body.sponsoredOrder != null ? Number(body.sponsoredOrder) : null;

  if (sponsoredPlacements.some((p) => !SPONSOR_PLACEMENTS.includes(p as never))) {
    return NextResponse.json({ error: "Invalid sponsorship placement" }, { status: 400 });
  }
  if (sponsoredOrder != null && !Number.isInteger(sponsoredOrder)) {
    return NextResponse.json({ error: "Display order must be a whole number" }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select("is_sponsored, sponsored_placements, sponsored_order")
    .eq("slug", params.slug)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("brands")
    .update({
      is_sponsored: isSponsored,
      sponsored_placements: isSponsored ? sponsoredPlacements : [],
      sponsored_order: sponsoredOrder,
    })
    .eq("slug", params.slug);

  if (error) {
    return safeErrorResponse("admin.brands.sponsorship", error, "Failed to update sponsorship");
  }

  await logAudit({
    actorId: admin.id,
    actorLabel: admin.email ?? admin.id,
    entityType: "brand",
    entityId: params.slug,
    action: "update",
    before: existing,
    after: { is_sponsored: isSponsored, sponsored_placements: isSponsored ? sponsoredPlacements : [], sponsored_order: sponsoredOrder },
  });

  return NextResponse.json({ ok: true });
}
