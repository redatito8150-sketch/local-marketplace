// Brand-owned merchandising Collections (the `collections` table —
// supabase/migrations/20260730000005_collections_and_sku_by_brand_id.sql).
// Not to be confused with lib/data/collections.ts, an unrelated pre-existing
// file that ranks products by sales for Best Sellers/Trending — kept in its
// own module specifically to avoid that name collision.
import { supabase } from "@/lib/supabase/client";
import type { CollectionRecord } from "@/types";

interface CollectionRow {
  id: string;
  brand_id: string;
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
    brandId: row.brand_id,
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
// `brandId` must already be resolved from the brand's URL slug by the
// caller — slug is only ever used to find the brand, never to query
// collections directly.
export async function getPublicCollectionsForBrand(brandId: string): Promise<CollectionRecord[]> {
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  if (error) throw new Error(`getPublicCollectionsForBrand failed: ${error.message}`);
  return ((data as CollectionRow[] | null) ?? []).map(toCollectionRecord);
}

export async function getPublicCollectionBySlug(
  brandId: string,
  collectionSlug: string
): Promise<CollectionRecord | null> {
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq("brand_id", brandId)
    .eq("slug", collectionSlug)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .maybeSingle();

  if (error) throw new Error(`getPublicCollectionBySlug failed: ${error.message}`);
  return data ? toCollectionRecord(data as CollectionRow) : null;
}
