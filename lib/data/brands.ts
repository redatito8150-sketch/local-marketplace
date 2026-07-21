import { supabase } from "@/lib/supabase/client";
import { logError } from "@/lib/errorLog";
import { getFollowerCountForBrand } from "@/lib/data/follows";
import { getVariantsForProducts } from "@/lib/data/variants";
import { ProductRow, toProductCard } from "@/lib/data/products";
import {
  BrandPageContent,
  BrandInfoBadge,
  BrandCategoryTab,
  BrandValue,
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
    plainSum += p.rating;
    if (p.review_count > 0) {
      weightedSum += p.rating * p.review_count;
      totalWeight += p.review_count;
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
    logError(`getBrandContent(${slug}) similar brands query failed`, similarError.message);
  }

  const similarBrands: SimilarBrand[] = (similarRows ?? []).map((r) => ({
    id: r.slug,
    name: r.name,
    category: r.category,
    city: r.city,
    image: r.hero_image,
  }));

  const productRowsTyped = (productRows ?? []) as ProductRow[];
  // Full Product shape (not the old lightweight BrandProduct) so the real
  // filter/sort system and the storefront's own ProductCard — with working
  // Add to Cart and star ratings — can be reused verbatim on brand pages.
  const productCards = productRowsTyped.map(toProductCard);
  const variantsByProduct = await getVariantsForProducts(productCards.map((c) => c.id));
  const products = productCards.map((c) => ({
    ...c,
    variants: variantsByProduct.get(c.id) ?? [],
  }));

  // brand_follows has no public policy, so the count needs supabaseAdmin —
  // degrades quietly to 0 rather than failing the whole page if it errors.
  const followerCount = await getFollowerCountForBrand(slug).catch((err) => {
    logError(`getBrandContent(${slug}) follower count failed`, err.message);
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
    products,
    storyImage: brand.story_image,
    storyImage2: brand.story_image_2 ?? undefined,
    storyBody: brand.story_body,
    values: brand.values ?? [],
    similarBrands,
    followerCount,
    storeRating: computeStoreRating(productRowsTyped),
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

export interface BrandSummary {
  slug: string;
  name: string;
  logoImage: string | null;
}

// Lightweight — no product/variant joins — for spots that only need a
// brand's name/logo (e.g. the homepage Sponsored pills), so we don't pull
// each brand's full catalog just to render a logo chip.
export async function getBrandSummariesBySlug(slugs: string[]): Promise<BrandSummary[]> {
  if (slugs.length === 0) return [];
  const { data, error } = await supabase
    .from("brands")
    .select("slug, name, logo_image")
    .in("slug", slugs);

  if (error) {
    throw new Error(`getBrandSummariesBySlug failed: ${error.message}`);
  }
  const bySlug = new Map((data ?? []).map((r) => [r.slug as string, r]));
  // Preserve the admin-chosen order rather than whatever order Postgres returns.
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((r): r is { slug: string; name: string; logo_image: string | null } => Boolean(r))
    .map((r) => ({ slug: r.slug, name: r.name as string, logoImage: r.logo_image }));
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
