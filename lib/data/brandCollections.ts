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
  cover_image_urls: string[] | null;
  tagline: string | null;
  is_active: boolean;
  published_at: string | null;
  visible_from: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sort_order: number;
}

export function toCollectionRecord(row: CollectionRow): CollectionRecord {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    coverImageUrls: row.cover_image_urls ?? (row.cover_image_url ? [row.cover_image_url] : []),
    tagline: row.tagline ?? undefined,
    isActive: row.is_active,
    publishedAt: row.published_at ?? undefined,
    visibleFrom: row.visible_from ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sortOrder: row.sort_order ?? 0,
  };
}

// Postgres "undefined_column" — the one specific case where an ORDER BY
// on a brand-new column (sort_order, added in
// 20260808000007_collections_sort_order.sql) fails outright rather than
// just coming back empty, unlike every other column added so far this
// round (those only ever showed up as undefined in a plain SELECT, never
// broke the query). Falls back to the previous ordering so this page
// doesn't 500 for the entire window between deploying this code and
// actually running that migration.
function isUndefinedColumnError(error: { code?: string } | null): boolean {
  return error?.code === "42703";
}

// A collection with a future visible_from is otherwise fully active/
// published — this is the one extra rule the public reads (RLS-backed
// storefront queries below) enforce beyond is_active/published_at, mirrored
// here at the app layer as defense in depth against the RLS policy.
function isVisibleNow(row: Pick<CollectionRow, "visible_from">): boolean {
  return !row.visible_from || new Date(row.visible_from).getTime() <= Date.now();
}

// Public storefront read (anon key, RLS-limited to active+published rows) —
// used by /brands/[slug]/collections and its [collectionSlug] detail page.
// `brandId` must already be resolved from the brand's URL slug by the
// caller — slug is only ever used to find the brand, never to query
// collections directly.
export async function getPublicCollectionsForBrand(brandId: string): Promise<CollectionRecord[]> {
  let { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .order("sort_order", { ascending: true });

  if (error && isUndefinedColumnError(error)) {
    ({ data, error } = await supabase
      .from("collections")
      .select("*")
      .eq("brand_id", brandId)
      .eq("is_active", true)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false }));
  }

  if (error) throw new Error(`getPublicCollectionsForBrand failed: ${error.message}`);
  return ((data as CollectionRow[] | null) ?? []).filter(isVisibleNow).map(toCollectionRecord);
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
  if (!data || !isVisibleNow(data as CollectionRow)) return null;
  return toCollectionRecord(data as CollectionRow);
}

// Owner/admin-facing read (service-role, every status — draft, paused,
// scheduled) for the Collections page's own inline-management UI. Unlike
// the public reads above, this deliberately shows everything so an owner
// can see and resume a paused or not-yet-visible collection.
export async function getAllCollectionsForBrand(brandId: string): Promise<CollectionRecord[]> {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  let { data, error } = await supabaseAdmin
    .from("collections")
    .select("*")
    .eq("brand_id", brandId)
    .order("sort_order", { ascending: true });

  if (error && isUndefinedColumnError(error)) {
    ({ data, error } = await supabaseAdmin
      .from("collections")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: true }));
  }

  if (error) throw new Error(`getAllCollectionsForBrand failed: ${error.message}`);
  return ((data as CollectionRow[] | null) ?? []).map(toCollectionRecord);
}
