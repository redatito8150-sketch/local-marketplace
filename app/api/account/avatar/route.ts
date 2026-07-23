import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";

const BUCKET = "product-images";
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function avatarPaths(userId: string) {
  return Object.values(EXTENSIONS).map((extension) => `account-avatars/${userId}/avatar.${extension}`);
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  }
  const extension = EXTENSIONS[file.type];
  if (!extension) {
    return NextResponse.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Your photo must be smaller than 2 MB." }, { status: 400 });
  }

  const path = `account-avatars/${user.id}/avatar.${extension}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (uploadError) {
    return safeErrorResponse("account.avatar.upload", uploadError, "Upload failed. Please try again.");
  }

  const stalePaths = avatarPaths(user.id).filter((candidate) => candidate !== path);
  await supabaseAdmin.storage.from(BUCKET).remove(stalePaths);
  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
  const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, avatar_url: avatarUrl, avatar_path: path },
  });
  if (metadataError) {
    return safeErrorResponse("account.avatar.update-metadata", metadataError);
  }
  return NextResponse.json({ ok: true, avatarUrl });
}

export async function DELETE() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  await supabaseAdmin.storage.from(BUCKET).remove(avatarPaths(user.id));
  const metadata = { ...user.user_metadata };
  delete metadata.avatar_url;
  delete metadata.avatar_path;
  const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: metadata,
  });
  if (error) return safeErrorResponse("account.avatar.delete", error);
  return NextResponse.json({ ok: true });
}
