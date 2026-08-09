import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface StorageCleanupJob {
  id: string;
  bucket_id: string;
  storage_path: string;
  attempts: number;
}

export interface StorageCleanupTarget {
  bucket_id: string;
  storage_path: string;
}

const AVATAR_EXTENSIONS = ["jpg", "png", "webp"] as const;

function avatarPaths(userId: string) {
  return AVATAR_EXTENSIONS.map((extension) => `account-avatars/${userId}/avatar.${extension}`);
}

export async function queueAccountStorageCleanup(userId: string): Promise<StorageCleanupJob[]> {
  const [reviewsResult, applicationsResult] = await Promise.all([
    supabaseAdmin.from("reviews").select("id").eq("user_id", userId),
    supabaseAdmin.from("brand_applications").select("id").eq("applicant_user_id", userId),
  ]);
  if (reviewsResult.error) throw reviewsResult.error;
  if (applicationsResult.error) throw applicationsResult.error;

  const reviewIds = (reviewsResult.data ?? []).map((row) => row.id as string);
  const applicationIds = (applicationsResult.data ?? []).map((row) => row.id as string);
  const [imagesResult, documentsResult] = await Promise.all([
    reviewIds.length
      ? supabaseAdmin.from("review_images").select("storage_path").in("review_id", reviewIds)
      : Promise.resolve({ data: [], error: null }),
    applicationIds.length
      ? supabaseAdmin.from("brand_application_documents").select("storage_path").in("application_id", applicationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (imagesResult.error) throw imagesResult.error;
  if (documentsResult.error) throw documentsResult.error;

  const targets = [
    ...avatarPaths(userId).map((storagePath) => ({ bucket_id: "product-images", storage_path: storagePath })),
    ...(imagesResult.data ?? []).map((row) => ({ bucket_id: "review-images", storage_path: row.storage_path as string })),
    ...(documentsResult.data ?? []).map((row) => ({ bucket_id: "brand-application-documents", storage_path: row.storage_path as string })),
  ];
  return queueStorageCleanupTargets(userId, targets);
}

export async function queueStorageCleanupTargets(
  ownerUserId: string,
  targets: StorageCleanupTarget[]
): Promise<StorageCleanupJob[]> {
  const uniqueTargets = [...new Map(targets.map((target) => [`${target.bucket_id}\0${target.storage_path}`, target])).values()];
  if (!uniqueTargets.length) return [];

  const { data, error } = await supabaseAdmin
    .from("storage_cleanup_jobs")
    .upsert(
      uniqueTargets.map((target) => ({ ...target, owner_user_id: ownerUserId, updated_at: new Date().toISOString() })),
      { onConflict: "bucket_id,storage_path" }
    )
    .select("id,bucket_id,storage_path,attempts");
  if (error) throw error;
  return (data ?? []) as StorageCleanupJob[];
}

export async function discardStorageCleanupJobs(jobIds: string[]) {
  if (!jobIds.length) return;
  const { error } = await supabaseAdmin.from("storage_cleanup_jobs").delete().in("id", jobIds);
  if (error) throw error;
}

export async function processStorageCleanupJobs(options: { jobIds?: string[]; limit?: number } = {}) {
  let query = supabaseAdmin
    .from("storage_cleanup_jobs")
    .select("id,bucket_id,storage_path,attempts")
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 500));
  if (options.jobIds) {
    if (!options.jobIds.length) return { completed: 0, pending: 0 };
    query = query.in("id", options.jobIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  const jobs = (data ?? []) as StorageCleanupJob[];
  const byBucket = new Map<string, StorageCleanupJob[]>();
  for (const job of jobs) {
    const bucketJobs = byBucket.get(job.bucket_id) ?? [];
    bucketJobs.push(job);
    byBucket.set(job.bucket_id, bucketJobs);
  }

  let completed = 0;
  for (const [bucketId, bucketJobs] of byBucket) {
    const removal = await supabaseAdmin.storage
      .from(bucketId)
      .remove(bucketJobs.map((job) => job.storage_path));
    if (!removal.error) {
      const ids = bucketJobs.map((job) => job.id);
      const { error: deleteError } = await supabaseAdmin.from("storage_cleanup_jobs").delete().in("id", ids);
      if (deleteError) throw deleteError;
      completed += ids.length;
      continue;
    }

    await Promise.all(
      bucketJobs.map((job) =>
        supabaseAdmin
          .from("storage_cleanup_jobs")
          .update({ attempts: job.attempts + 1, last_error: removal.error.message, updated_at: new Date().toISOString() })
          .eq("id", job.id)
      )
    );
  }

  return { completed, pending: jobs.length - completed };
}
