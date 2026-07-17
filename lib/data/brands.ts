import { supabase } from "@/lib/supabase/client";
import {
  BrandPageContent,
  BrandInfoBadge,
  BrandCategoryTab,
  BrandValue,
  BrandProduct,
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
  about_description: string;
  about_image: string;
  story_image: string;
  story_body: string;
  info_badges: BrandInfoBadge[];
  category_tabs: BrandCategoryTab[];
  active_tab: string;
  values: BrandValue[];
  similar_brand_slugs: string[];
}

interface ProductRow {
  id: string;
  name: string;
  price: number;
  currency: "EGP" | "USD";
  colors: { name: string; hex: string }[];
  image: string;
  is_new: boolean;
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
    .eq("brand_slug", slug);

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

  return {
    slug: brand.slug,
    name: brand.name,
    tagline: brand.tagline,
    category: brand.category,
    foundedYear: brand.founded_year ?? 2020,
    city: brand.city,
    heroImage: brand.hero_image,
    aboutDescription: brand.about_description,
    aboutImage: brand.about_image,
    infoBadges: brand.info_badges ?? [],
    categoryTabs: brand.category_tabs ?? [],
    activeTab: brand.active_tab ?? "shop-all",
    products: ((productRows ?? []) as ProductRow[]).map(toBrandProduct),
    storyImage: brand.story_image,
    storyBody: brand.story_body,
    values: brand.values ?? [],
    similarBrands,
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
