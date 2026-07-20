import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/supabase/adminAuth";
import { requireBrandOwner } from "@/lib/supabase/brandAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notify } from "@/lib/notify";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
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

// Shared by both the admin product form and the brand-portal one (Round
// 3) — a real owner/assistant uploading their own product's photos isn't
// a sensitive write (just a file under a scoped storage folder), so this
// accepts either caller rather than admin-only.
async function requireUploader() {
  const admin = await requireAdminUser();
  if (admin) return true;
  const owner = await requireBrandOwner();
  return Boolean(owner && !owner.isImpersonating);
}

// Uploads always go through this server-only route with the service-role
// client — the form never talks to Supabase Storage directly, same
// client/server split every other write in this project follows.
export async function POST(request: NextRequest) {
  if (!(await requireUploader())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const formData = await request.formData();
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
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Image is larger than 5MB" }, { status: 400 });
  }

  const path = `products/${folderId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    await notify("storage_error", "Product image upload failed", uploadError.message);
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}

export async function DELETE(request: NextRequest) {
  if (!(await requireUploader())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const path = body?.path;
  if (typeof path !== "string" || !path.startsWith("products/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
  if (error) {
    return NextResponse.json(
      { error: `Delete failed: ${error.message}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
