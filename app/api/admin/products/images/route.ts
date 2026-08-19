import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";
import {
  isCanonicalProductFolderId,
  isUuid,
  prepareSafeImageUpload,
} from "@/lib/uploads/imageValidation";
import { checkRateLimit } from "@/lib/rateLimit";
import { readFormData } from "@/lib/uploads/formData";
import { safeErrorResponse } from "@/lib/apiError";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const BUCKET = "product-images";

type Uploader =
  | { kind: "admin"; userId: string }
  | { kind: "owner"; brandSlug: string; userId: string };

// Shared by both the admin product form and the brand-portal one (Round
// 3) — a real owner/assistant uploading their own product's photos isn't
// a sensitive write (just a file under a scoped storage folder), so this
// accepts either caller rather than admin-only.
async function requireUploader(): Promise<Uploader | null> {
  const admin = await requireAdminUser();
  if (admin) return { kind: "admin", userId: admin.id };
  const owner = await requireBrandOwner();
  if (owner && !owner.isImpersonating && owner.brandSlug) {
    return { kind: "owner", brandSlug: owner.brandSlug, userId: owner.user.id };
  }
  return null;
}

// A brand owner may only touch folders under their own brand's products.
// `folderId` doubles as a real product id (editing) or a client-generated
// temporary id (creating a new product before it has a real id) — a temp
// id has no matching row yet, so it's allowed through rather than guessed
// at; once a real product row exists, its brand_slug is the source of truth.
async function getProductFolderAccess(folderId: string, uploader: Uploader) {
  const { data } = await supabaseAdmin
    .from("products")
    .select("brand_slug")
    .eq("id", folderId)
    .maybeSingle();
  if (uploader.kind === "admin") return { allowed: true, exists: Boolean(data) };
  return { allowed: data?.brand_slug === uploader.brandSlug, exists: Boolean(data) };
}

async function uploadPathFor(folderId: string, fileName: string, uploader: Uploader) {
  const access = await getProductFolderAccess(folderId, uploader);
  if (access.exists) return access.allowed ? `products/${folderId}/${fileName}` : null;
  if (uploader.kind === "owner") {
    return isUuid(folderId) ? `product-drafts/${uploader.userId}/${folderId}/${fileName}` : null;
  }
  return `products/${folderId}/${fileName}`;
}

async function canDeletePath(path: string, uploader: Uploader): Promise<boolean> {
  const segments = path.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return false;
  if (segments[0] === "products" && segments.length === 3) {
    const folderId = segments[1];
    if (!isCanonicalProductFolderId(folderId)) return false;
    if (uploader.kind === "admin") return true;
    const access = await getProductFolderAccess(folderId, uploader);
    return access.exists && access.allowed;
  }
  if (segments[0] === "product-drafts" && segments.length === 4) {
    if (uploader.kind === "admin") return true;
    return segments[1] === uploader.userId && isUuid(segments[2]);
  }
  return false;
}

// Uploads always go through this server-only route with the service-role
// client — the form never talks to Supabase Storage directly, same
// client/server split every other write in this project follows.
export async function POST(request: NextRequest) {
  const uploader = await requireUploader();
  if (!uploader) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`product-image-upload:${uploader.userId}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many uploads — please slow down" }, { status: 429 });
  }

  const formData = await readFormData(request);
  const file = formData.get("file");
  // `folderId` is the product id when editing, or a client-generated
  // temporary id while creating a new product (before it has a real id) —
  // either way just a storage folder name, not trusted for anything else.
  const folderId = formData.get("folderId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (typeof folderId !== "string" || !folderId.trim()) {
    return NextResponse.json({ error: "Missing folderId" }, { status: 400 });
  }
  if (!isCanonicalProductFolderId(folderId)) {
    return NextResponse.json({ error: "Invalid upload folder" }, { status: 400 });
  }
  const prepared = await prepareSafeImageUpload(file, {
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    maxBytes: MAX_FILE_SIZE,
  });
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });

  const fileName = `${randomUUID()}.${prepared.upload.extension}`;
  const path = await uploadPathFor(folderId, fileName, uploader);
  if (!path) {
    return NextResponse.json({ error: "Not authorized for this product" }, { status: 403 });
  }
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, prepared.upload.bytes, { contentType: prepared.upload.mimeType, upsert: false });

  if (uploadError) {
    await notify("storage_error", "Product image upload failed", uploadError.message);
    return safeErrorResponse("admin.products.images.upload", uploadError, "Upload failed");
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const folderAccess = await getProductFolderAccess(folderId, uploader);
  const { error: registryError } = await supabaseAdmin.from("product_storage_assets").insert({
    product_id: folderAccess.exists ? folderId : null,
    bucket_id: BUCKET,
    storage_path: path,
    public_url: data.publicUrl,
    uploaded_by: uploader.userId,
    upload_folder_id: folderId,
    claimed_at: folderAccess.exists ? new Date().toISOString() : null,
  });
  if (registryError) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return safeErrorResponse("admin.products.images.register", registryError, "Upload could not be registered safely");
  }
  return NextResponse.json({ url: data.publicUrl, path });
}

export async function DELETE(request: NextRequest) {
  const uploader = await requireUploader();
  if (!uploader) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(`product-image-delete:${uploader.userId}`, 40, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests — please slow down" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const path = body?.path;
  if (typeof path !== "string") {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // path shape is always "products/{folderId}/{filename}" — reject
  // anything that doesn't carry a folder segment to check ownership on.
  if (!(await canDeletePath(path, uploader))) {
    return NextResponse.json({ error: "Not authorized for this product" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
  if (error) {
    return safeErrorResponse("admin.products.images.delete", error, "Delete failed");
  }
  await supabaseAdmin.from("product_storage_assets").delete().eq("bucket_id", BUCKET).eq("storage_path", path);
  return NextResponse.json({ ok: true });
}
