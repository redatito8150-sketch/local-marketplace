import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireCollectionsEditor } from "@/lib/brandCollectionsAuth";
import { hasExpectedImageSignature } from "@/lib/uploads/imageValidation";
import { readFormData } from "@/lib/uploads/formData";
import { checkRateLimit } from "@/lib/rateLimit";
import { safeErrorResponse } from "@/lib/apiError";
import { notify } from "@/lib/notify";
import { logAudit } from "@/lib/auditLog";

// Same bucket/validation as app/api/brands/[slug]/image — a collection's
// cover slideshow (components/brand/CollectionCoverCarousel) can hold more
// than one photo, added/removed one at a time here.
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGES = 4;
const BUCKET = "product-images";

function sanitizeFileName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(-80) || "image"
  );
}

async function loadOwnCollection(id: string, brandId: string) {
  const { data } = await supabaseAdmin.from("collections").select("*").eq("id", id).maybeSingle();
  if (!data || data.brand_id !== brandId) return null;
  return data;
}

export async function POST(request: NextRequest, props: { params: Promise<{ slug: string; id: string }> }) {
  const params = await props.params;
  const editor = await requireCollectionsEditor(params.slug);
  if (!editor) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  if (!checkRateLimit(`brand-collection-image-upload:${editor.userId}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many uploads — please slow down" }, { status: 429 });
  }

  const existing = await loadOwnCollection(params.id, editor.brandId);
  if (!existing) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const currentImages: string[] = existing.cover_image_urls ?? (existing.cover_image_url ? [existing.cover_image_url] : []);
  if (currentImages.length >= MAX_IMAGES) {
    return NextResponse.json({ error: `Up to ${MAX_IMAGES} cover photos` }, { status: 400 });
  }

  const formData = await readFormData(request);
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Image is larger than 5MB" }, { status: 400 });
  }
  if (!(await hasExpectedImageSignature(file))) {
    return NextResponse.json({ error: "The file content is not a valid image" }, { status: 400 });
  }

  const fileName = `${Date.now()}-${sanitizeFileName(file.name)}`;
  const path = `brands/${params.slug}/collections/${params.id}-${fileName}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    await notify("storage_error", "Collection cover upload failed", uploadError.message);
    return safeErrorResponse("brands.collections.cover-upload", uploadError, "Upload failed");
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const nextImages = [...currentImages, publicUrlData.publicUrl];

  const { error } = await supabaseAdmin
    .from("collections")
    .update({ cover_image_urls: nextImages, cover_image_url: nextImages[0] })
    .eq("id", params.id);
  if (error) return safeErrorResponse("brands.collections.cover-save", error, "Failed to save image");

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "collection",
    entityId: params.id,
    action: "update",
    before: { cover_image_urls: currentImages },
    after: { cover_image_urls: nextImages },
    brandSlug: params.slug,
  });

  return NextResponse.json({ coverImageUrls: nextImages });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ slug: string; id: string }> }) {
  const params = await props.params;
  const editor = await requireCollectionsEditor(params.slug);
  if (!editor) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const existing = await loadOwnCollection(params.id, editor.brandId);
  if (!existing) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const index = Number(searchParams.get("index"));
  const currentImages: string[] = existing.cover_image_urls ?? (existing.cover_image_url ? [existing.cover_image_url] : []);
  if (!Number.isInteger(index) || index < 0 || index >= currentImages.length) {
    return NextResponse.json({ error: "Invalid image index" }, { status: 400 });
  }

  const nextImages = currentImages.filter((_, i) => i !== index);
  const { error } = await supabaseAdmin
    .from("collections")
    .update({ cover_image_urls: nextImages, cover_image_url: nextImages[0] ?? null })
    .eq("id", params.id);
  if (error) return safeErrorResponse("brands.collections.cover-remove", error, "Failed to remove image");

  await logAudit({
    actorId: editor.userId,
    actorLabel: editor.actorLabel,
    entityType: "collection",
    entityId: params.id,
    action: "update",
    before: { cover_image_urls: currentImages },
    after: { cover_image_urls: nextImages },
    brandSlug: params.slug,
  });

  return NextResponse.json({ coverImageUrls: nextImages });
}
