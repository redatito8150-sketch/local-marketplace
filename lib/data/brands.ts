import { supabase } from "@/lib/supabase/client";
import { getFollowerCountForBrand } from "@/lib/data/follows";
import {
  BrandPageContent,
  BrandInfoBadge,
  BrandCategoryTab,
  BrandValue,
  BrandProduct,
  BrandShopTheLookTile,
  SimilarBrand,
} from "@/types";

interface BrandRow {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  founded_year: number | null;
  city: string;
  hero_image: string;
  logo_image: string | null;
  website_url: string | null;
  about_description: string;
  about_image: string;
  story_image: string;
  story_image_2: string | null;
  story_body: string;
  info_badges: BrandInfoBadge[];
  category_tabs: BrandCategoryTab[];
  active_tab: string;
  values: BrandValue[];
  similar_brand_slugs: string[];
  shop_the_look: BrandShopTheLookTile[];
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  currency: "EGP" | "USD";
  colors: { name: string; hex: string }[];
  image: string;
  is_new: boolean;
  rating: number | null;
  review_count: number | null;
}

function toBrandProduct(row: ProductRow): BrandProduct {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    currency: "EGP",
    colors: (row.colors ?? []).map((c) => c.hex),
    image: row.image,
    isNew: row.is_new,
  };
}

// No per-brand rating aggregate column exists — weight each product's own
// rating by its review count so a product with 1 five-star review doesn't
// skew the brand average as much as one with 200 reviews. Every product
// has a rating (defaults to 5) even with zero recorded reviews, same as
// what already shows on its own product card — so when nothing in the
// catalog has real review weight yet, fall back to a plain average of
// those same displayed ratings instead of a misleading "0.0".
function computeStoreRating(products: ProductRow[]): number {
  if (products.length === 0) return 0;

  let totalWeight = 0;
  let weightedSum = 0;
  let plainSum = 0;
  for (const p of products) {
    const rating = p.rating ?? 0;
    const weight = p.review_count ?? 0;
    plainSum += rating;
    if (weight > 0) {
      weightedSum += rating * weight;
      totalWeight += weight;
    }
  }
  if (totalWeight > 0) return weightedSum / totalWeight;
  return plainSum / products.length;
}

export async function getBrandContent(slug: string): Promise<BrandPageContent | null> {
  const { data: brandRow, error } = await supabase
    .from("brands")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`getBrandContent(${slug}) failed: ${error.message}`);
  }
  if (!brandRow) return null;
  const brand = brandRow as BrandRow;

  const { data: productRows, error: productsError } = await supabase
    .from("products")
    .select("*")
    .eq("brand_slug", slug)
    .eq("status", "published")
    .eq("paused_by_brand", false);

  if (productsError) {
    throw new Error(
      `getBrandContent(${slug}) products query failed: ${productsError.message}`
    );
  }

  const { data: similarRows, error: similarError } = await supabase
    .from("brands")
    .select("slug, name, category, city, hero_image")
    .in("slug", brand.similar_brand_slugs?.length ? brand.similar_brand_slugs : ["__none__"]);

  // Similar brands are supplementary — degrade quietly rather than failing
  // the whole brand page if this secondary lookup breaks.
  if (similarError) {
    console.error(`getBrandContent(${slug}) similar brands query failed:`, similarError.message);
  }

  const similarBrands: SimilarBrand[] = (similarRows ?? []).map((r) => ({
    id: r.slug,
    name: r.name,
    category: r.category,
    city: r.city,
    image: r.hero_image,
  }));

  const products = (productRows ?? []) as ProductRow[];
  // brand_follows has no public policy, so the count needs supabaseAdmin —
  // degrades quietly to 0 rather than failing the whole page if it errors.
  const followerCount = await getFollowerCountForBrand(slug).catch((err) => {
    console.error(`getBrandContent(${slug}) follower count failed:`, err.message);
    return 0;
  });

  return {
    slug: brand.slug,
    name: brand.name,
    tagline: brand.tagline,
    category: brand.category,
    foundedYear: brand.founded_year ?? 2020,
    city: brand.city,
    heroImage: brand.hero_image,
    logoImage: brand.logo_image ?? undefined,
    websiteUrl: brand.website_url ?? undefined,
    aboutDescription: brand.about_description,
    aboutImage: brand.about_image,
    infoBadges: brand.info_badges ?? [],
    categoryTabs: brand.category_tabs ?? [],
    activeTab: brand.active_tab ?? "shop-all",
    products: products.map(toBrandProduct),
    storyImage: brand.story_image,
    storyImage2: brand.story_image_2 ?? undefined,
    storyBody: brand.story_body,
    values: brand.values ?? [],
    similarBrands,
    followerCount,
    storeRating: computeStoreRating(products),
    shopTheLook: brand.shop_the_look ?? [],
  };
}

export async function getAllBrandSlugs(): Promise<string[]> {
  const { data, error } = await supabase.from("brands").select("slug");
  if (error) {
    throw new Error(`getAllBrandSlugs failed: ${error.message}`);
  }
  return (data ?? []).map((r) => r.slug as string);
}

export interface FeaturedBrandSummary {
  name: string;
  slug: string;
  thumbnail: string;
}

export async function getFeaturedBrands(): Promise<FeaturedBrandSummary[]> {
  const { data, error } = await supabase
    .from("brands")
    .select("slug, name, hero_image")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getFeaturedBrands failed: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    name: r.name as string,
    thumbnail: r.hero_image as string,
  }));
}
