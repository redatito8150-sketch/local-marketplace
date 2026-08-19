import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import { prepareSafeImageUpload } from "@/lib/uploads/imageValidation";
import { checkRateLimit } from "@/lib/rateLimit";
import { readFormData } from "@/lib/uploads/formData";
import { safeErrorResponse } from "@/lib/apiError";
import { logAudit } from "@/lib/auditLog";
import { BRAND_IMAGE_FIELDS, BRAND_IMAGE_FIELD_TO_COLUMN, type BrandImageField } from "@/lib/brandImageFields";

// Inline image editing on the public brand page (cover/logo/about photo) —
// reuses the existing, already-verified-working "product-images" bucket
// under a brands/ prefix rather than provisioning a brand-new Storage
// bucket (bucket-creation-via-SQL is documented elsewhere in this repo as
// unreliable and needing manual dashboard verification; this sidesteps
// that entirely).
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const BUCKET = "product-images";
const ALLOWED_FIELDS = BRAND_IMAGE_FIELDS;
const FIELD_TO_COLUMN = BRAND_IMAGE_FIELD_TO_COLUMN;

// Owner-only (not assistants — same precedent as the brand-portal's own
// page-content editor) or any platform admin, exactly mirroring the
// permission check in the sibling inline-edit route.
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

  if (!checkRateLimit(`brand-image-upload:${editor.userId}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many uploads — please slow down" }, { status: 429 });
  }

  const formData = await readFormData(request);
  const file = formData.get("file");
  const field = formData.get("field");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (typeof field !== "string" || !ALLOWED_FIELDS.includes(field as BrandImageField)) {
    return NextResponse.json({ error: "Invalid image field" }, { status: 400 });
  }
  const prepared = await prepareSafeImageUpload(file, {
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    maxBytes: MAX_FILE_SIZE,
  });
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });

  const fileName = `${randomUUID()}.${prepared.upload.extension}`;
  const path = `brands/${params.slug}/${field}-${fileName}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, prepared.upload.bytes, { contentType: prepared.upload.mimeType, upsert: false });

  if (uploadError) {
    await notify("storage_error", "Brand image upload failed", uploadError.message);
    return safeErrorResponse("brands.image.upload", uploadError, "Upload failed");
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const column = FIELD_TO_COLUMN[field as BrandImageField];

  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select(column)
    .eq("slug", params.slug)
    .maybeSingle();

  const { error: updateError } = await supabaseAdmin
    .from("brands")
    .update({ [column]: publicUrlData.publicUrl })
    .eq("slug", params.slug);

  if (updateError) {
    return safeErrorResponse("brands.image.save", updateError, "Failed to save image");
  }

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "brand",
    entityId: params.slug,
    action: "update",
    before: existing,
    after: { [column]: publicUrlData.publicUrl },
    brandSlug: params.slug,
  });

  return NextResponse.json({ url: publicUrlData.publicUrl });
}

// Clears a brand image field back to empty (the "remove this photo"
// affordance) — never deletes the underlying Storage object, only unsets
// the DB column, same trade-off /admin already makes elsewhere: keeps
// this route simple and avoids a stale-URL race if something else still
// references the file mid-request.
export async function DELETE(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const editor = await requireEditor(params.slug);
  if (!editor) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const field = searchParams.get("field");
  if (typeof field !== "string" || !ALLOWED_FIELDS.includes(field as BrandImageField)) {
    return NextResponse.json({ error: "Invalid image field" }, { status: 400 });
  }

  const column = FIELD_TO_COLUMN[field as BrandImageField];
  const { data: existing } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  const previousUrl = existing ? (existing as Record<string, unknown>)[column] : null;
  const backups = (existing?.deleted_image_backups as Record<string, string> | null) ?? {};
  // Only ever remembers the single most-recently-cleared URL per field —
  // this key gets clobbered on every delete, on purpose, so the column
  // can never grow into a full history.
  const nextBackups = previousUrl ? { ...backups, [field]: previousUrl } : backups;

  const { error } = await supabaseAdmin
    .from("brands")
    .update({ [column]: "", deleted_image_backups: nextBackups })
    .eq("slug", params.slug);
  if (error) {
    return safeErrorResponse("brands.image.remove", error, "Failed to remove image");
  }

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "brand",
    entityId: params.slug,
    action: "update",
    before: existing,
    after: { [column]: "" },
    brandSlug: params.slug,
  });

  return NextResponse.json({ ok: true, canRestore: Boolean(previousUrl) });
}
