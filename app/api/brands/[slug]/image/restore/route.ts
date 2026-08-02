import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { BRAND_IMAGE_FIELDS, BRAND_IMAGE_FIELD_TO_COLUMN, type BrandImageField } from "@/lib/brandImageFields";

// Undoes the sibling DELETE in ../route.ts — writes the one backed-up URL
// for this field (see deleted_image_backups, set at delete time) back onto
// the live column, then clears that backup key since it's been consumed.
async function requireEditor(brandSlug: string) {
  const admin = await requireAdminUser();
  if (admin) return { userId: admin.id, actorLabel: admin.email ?? admin.id };
  const owner = await requireBrandOwner();
  if (owner && owner.brandSlug === brandSlug && owner.accessLevel === "owner") {
    return { userId: owner.user.id, actorLabel: owner.user.email ?? owner.user.id };
  }
  return null;
}

export async function POST(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const editor = await requireEditor(params.slug);
  if (!editor) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`brand-image-restore:${editor.userId}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const field = body?.field;
  if (typeof field !== "string" || !BRAND_IMAGE_FIELDS.includes(field as BrandImageField)) {
    return NextResponse.json({ error: "Invalid image field" }, { status: 400 });
  }

  const column = BRAND_IMAGE_FIELD_TO_COLUMN[field as BrandImageField];
  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  const backups = (existing?.deleted_image_backups as Record<string, string> | null) ?? {};
  const backupUrl = backups[field];
  if (!backupUrl) {
    return NextResponse.json({ error: "Nothing to restore" }, { status: 400 });
  }

  const { [field]: _restored, ...remainingBackups } = backups;
  const { error } = await supabaseAdmin
    .from("brands")
    .update({ [column]: backupUrl, deleted_image_backups: remainingBackups })
    .eq("slug", params.slug);

  if (error) {
    return safeErrorResponse("brands.image.restore", error, "Failed to restore image");
  }

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "brand",
    entityId: params.slug,
    action: "update",
    before: existing,
    after: { [column]: backupUrl },
    brandSlug: params.slug,
  });

  return NextResponse.json({ url: backupUrl });
}
