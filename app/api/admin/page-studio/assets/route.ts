import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/auditLog";
import { prepareSafeImageUpload } from "@/lib/uploads/imageValidation";
import { readFormData } from "@/lib/uploads/formData";
import { requireStaffRole } from "@/lib/supabase/adminAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "product-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
const PAGE_KEY = /^[a-z][a-z0-9-]{0,39}$/;

async function manager() {
  return requireStaffRole("manager");
}

export async function GET(request: NextRequest) {
  const staff = await manager();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const pageKey = request.nextUrl.searchParams.get("pageKey") ?? "";
  if (!PAGE_KEY.test(pageKey)) return NextResponse.json({ error: "Invalid page key" }, { status: 400 });

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(`page-studio/${pageKey}`, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error) return NextResponse.json({ error: "Could not load the asset library" }, { status: 500 });
  const assets = (data ?? []).filter((item) => item.name && item.id).map((item) => {
    const path = `page-studio/${pageKey}/${item.name}`;
    return { path, url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, name: item.name, createdAt: item.created_at };
  });
  return NextResponse.json({ assets });
}

export async function POST(request: NextRequest) {
  const staff = await manager();
  if (!staff) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const form = await readFormData(request);
  const file = form.get("file");
  const pageKey = form.get("pageKey");
  if (!(file instanceof File) || typeof pageKey !== "string" || !PAGE_KEY.test(pageKey)) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  const prepared = await prepareSafeImageUpload(file, {
    allowedMimeTypes: ALLOWED_TYPES,
    maxBytes: MAX_FILE_SIZE,
  });
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: 400 });

  const path = `page-studio/${pageKey}/${randomUUID()}.${prepared.upload.extension}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, prepared.upload.bytes, { contentType: prepared.upload.mimeType, upsert: false });
  if (error) return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
  const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  await logAudit({ actorId: staff.user.id, actorLabel: staff.user.email ?? staff.user.id, entityType: "page", entityId: pageKey, action: "upload_asset", after: { path } });
  return NextResponse.json({ path, url });
}
