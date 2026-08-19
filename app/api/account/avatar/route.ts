import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/accountAuth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { safeErrorResponse } from "@/lib/apiError";
import { readFormData } from "@/lib/uploads/formData";
import { queueStorageCleanupTargets } from "@/lib/account/storageCleanup";
import { hasExpectedImageSignature } from "@/lib/uploads/imageValidation";

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

  const formData = await readFormData(request);
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
  if (!(await hasExpectedImageSignature(file))) {
    return NextResponse.json({ error: "The file content is not a valid image" }, { status: 400 });
  }

  const path = `account-avatars/${user.id}/avatar.${extension}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true, cacheControl: "3600" });
  if (uploadError) {
    return safeErrorResponse("account.avatar.upload", uploadError, "Upload failed. Please try again.");
  }

  const stalePaths = avatarPaths(user.id).filter((candidate) => candidate !== path);
  const staleRemoval = await supabaseAdmin.storage.from(BUCKET).remove(stalePaths);
  if (staleRemoval.error) {
    await queueStorageCleanupTargets(
      user.id,
      stalePaths.map((storagePath) => ({ bucket_id: BUCKET, storage_path: storagePath }))
    ).catch(() => undefined);
  }
  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
  // profiles.avatar_url only — this is the one write path for a manually
  // uploaded photo. Never write avatar_url into auth.users.user_metadata:
  // that key is rewritten by Supabase's own GoTrue on every Google sign-in
  // (see the on_auth_user_metadata_updated trigger), which is exactly what
  // silently overwrote manually uploaded photos before this fix.
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);
  if (profileError) {
    await queueStorageCleanupTargets(user.id, [{ bucket_id: BUCKET, storage_path: path }]).catch(() => undefined);
    return safeErrorResponse("account.avatar.update-profile", profileError);
  }
  return NextResponse.json({ ok: true, avatarUrl });
}

export async function DELETE() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const removal = await supabaseAdmin.storage.from(BUCKET).remove(avatarPaths(user.id));
  if (removal.error) {
    return safeErrorResponse(
      "account.avatar.remove",
      removal.error,
      "We couldn't delete your photo. Nothing was changed; please try again."
    );
  }
  // Clears the manual photo only — provider_avatar_url (the Google photo,
  // if any) is left untouched so it can appear as the fallback again.
  const { error } = await supabaseAdmin.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) return safeErrorResponse("account.avatar.delete", error);
  return NextResponse.json({ ok: true });
}
