// Brand-owned merchandising Collections (the `collections` table —
// supabase/migrations/20260729000003_sku_and_collections.sql). Not to be
// confused with lib/data/collections.ts, an unrelated pre-existing file
// that ranks products by sales for Best Sellers/Trending — kept in its own
// module specifically to avoid that name collision.
import { supabase } from "@/lib/supabase/client";
import type { CollectionRecord } from "@/types";

interface CollectionRow {
  id: string;
  brand_slug: string;
  name: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  is_active: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function toCollectionRecord(row: CollectionRow): CollectionRecord {
  return {
    id: row.id,
    brandSlug: row.brand_slug,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    isActive: row.is_active,
    publishedAt: row.published_at ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Public storefront read (anon key, RLS-limited to active+published rows) —
// used by /brands/[slug]/collections and its [collectionSlug] detail page.
export async function getPublicCollectionsForBrand(brandSlug: string): Promise<CollectionRecord[]> {
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq("brand_slug", brandSlug)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  if (error) throw new Error(`getPublicCollectionsForBrand failed: ${error.message}`);
  return ((data as CollectionRow[] | null) ?? []).map(toCollectionRecord);
}

export async function getPublicCollectionBySlug(
  brandSlug: string,
  collectionSlug: string
): Promise<CollectionRecord | null> {
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq("brand_slug", brandSlug)
    .eq("slug", collectionSlug)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .maybeSingle();

  if (error) throw new Error(`getPublicCollectionBySlug failed: ${error.message}`);
  return data ? toCollectionRecord(data as CollectionRow) : null;
}
