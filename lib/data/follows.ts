import { supabaseAdmin } from "@/lib/supabase/admin";

// brand_follows has no public "list everyone" policy — only
// `user_id = auth.uid()` — so any cross-account read (a follower COUNT, or
// "does this other user follow this brand") needs the service-role client,
// same convention as getBestSellingProducts's order_items aggregation.
export async function getFollowerCountForBrand(slug: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("brand_follows")
    .select("id", { count: "exact", head: true })
    .eq("brand_slug", slug);

  if (error) {
    throw new Error(`getFollowerCountForBrand(${slug}) failed: ${error.message}`);
  }
  return count ?? 0;
}

export async function isUserFollowingBrand(userId: string, slug: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("brand_follows")
    .select("id")
    .eq("user_id", userId)
    .eq("brand_slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`isUserFollowingBrand(${userId}, ${slug}) failed: ${error.message}`);
  }
  return Boolean(data);
}

export interface FollowedBrandSummary {
  slug: string;
  name: string;
  heroImage: string;
}

// Used by the account Overview page (Phase B7) — kept here alongside the
// other follow reads rather than duplicated into lib/data/account later.
export async function getFollowedBrandsForUser(userId: string): Promise<FollowedBrandSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("brand_follows")
    .select("brands(slug, name, hero_image)")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`getFollowedBrandsForUser(${userId}) failed: ${error.message}`);
  }

  return ((data ?? []) as unknown as { brands: { slug: string; name: string; hero_image: string } | null }[])
    .filter((row) => row.brands)
    .map((row) => ({
      slug: row.brands!.slug,
      name: row.brands!.name,
      heroImage: row.brands!.hero_image,
    }));
}
