const BUCKET = "product-images";

// product_media.storage_reference / product_color_images.image_url store
// the full public URL returned by Supabase Storage's getPublicUrl() at
// upload time (see app/api/admin/products/images/route.ts), not a bare
// path — every image a product ever had lives under
// `products/{productId}/...` in the `product-images` bucket (that upload
// route enforces the folder-per-product convention). Extracting only URLs
// that match this exact bucket + owned-folder prefix is what guarantees
// we only ever queue a genuinely product-owned file for deletion — a
// stray external URL, a URL from a different bucket, or a path outside
// this product's own folder is silently left alone, never queued.
function ownedStoragePath(url: string, productId: string): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  const prefix = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  const ownedPrefix = `products/${productId}/`;
  if (!path.startsWith(ownedPrefix)) return null;
  if (path.includes("..")) return null;
  return path;
}

export interface StorageCleanupTargetLike {
  bucket_id: string;
  storage_path: string;
}

// Filters a raw list of stored media URLs (captured by delete_draft_product
// right before the product row — and its cascaded product_media/
// product_color_images rows — is permanently deleted) down to the subset
// this product actually owns in Storage, ready to hand to
// queueStorageCleanupTargets(). Never returns a path for a URL that isn't
// unambiguously this product's own folder.
export function extractOwnedStorageTargets(productId: string, urls: (string | null | undefined)[]): StorageCleanupTargetLike[] {
  const targets: StorageCleanupTargetLike[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    const path = ownedStoragePath(url, productId);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    targets.push({ bucket_id: BUCKET, storage_path: path });
  }
  return targets;
}
