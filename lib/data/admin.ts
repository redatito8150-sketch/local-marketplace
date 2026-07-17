import { supabase } from "@/lib/supabase/client";
import {
  BrandCategoryTab,
  BrandInfoBadge,
  BrandRecord,
  BrandValue,
  CategorySlug,
  ProductColorOption,
  ProductRecord,
} from "@/types";

interface ProductRow {
  id: string;
  name: string;
  brand_name: string;
  brand_slug: string | null;
  category: CategorySlug | null;
  price: number;
  currency: "USD" | "EGP";
  image: string;
  images: string[];
  colors: ProductColorOption[];
  sizes: string[];
  description: string;
  details: string[];
  care_instructions: string[];
  shipping_returns: string;
  sku: string;
  in_stock: boolean;
  is_new: boolean;
  is_unisex: boolean;
  unavailable_sizes: string[];
}

function toProductRecord(row: ProductRow): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brand_name,
    brandSlug: row.brand_slug ?? undefined,
    category: row.category ?? undefined,
    price: Number(row.price),
    currency: row.currency,
    image: row.image,
    images: row.images ?? [],
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    unavailableSizes: row.unavailable_sizes ?? [],
    description: row.description,
    details: row.details ?? [],
    careInstructions: row.care_instructions ?? [],
    shippingReturns: row.shipping_returns,
    sku: row.sku,
    inStock: row.in_stock,
    isNew: row.is_new,
    isUnisex: row.is_unisex,
  };
}

// Public SELECT policy on `products` already allows this — no service role
// needed for reads, only for the create/update/delete routes.
export async function getAllProductsForAdmin(): Promise<ProductRecord[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllProductsForAdmin failed: ${error.message}`);
  }
  return (data as ProductRow[]).map(toProductRecord);
}

export async function getProductForAdmin(id: string): Promise<ProductRecord | null> {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`getProductForAdmin(${id}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toProductRecord(data as ProductRow);
}

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

function toBrandRecord(row: BrandRow): BrandRecord {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    category: row.category,
    foundedYear: row.founded_year ?? undefined,
    city: row.city,
    heroImage: row.hero_image,
    aboutDescription: row.about_description,
    aboutImage: row.about_image,
    storyImage: row.story_image,
    storyBody: row.story_body,
    infoBadges: row.info_badges ?? [],
    categoryTabs: row.category_tabs ?? [],
    activeTab: row.active_tab,
    values: row.values ?? [],
    similarBrandSlugs: row.similar_brand_slugs ?? [],
  };
}

// Public SELECT policy on `brands` already allows this — no service role
// needed for reads, only for the create/update/delete routes.
export async function getAllBrandsForAdmin(): Promise<BrandRecord[]> {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getAllBrandsForAdmin failed: ${error.message}`);
  }
  return (data as BrandRow[]).map(toBrandRecord);
}

export async function getBrandForAdmin(slug: string): Promise<BrandRecord | null> {
  const { data, error } = await supabase.from("brands").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(`getBrandForAdmin(${slug}) failed: ${error.message}`);
  }
  if (!data) return null;
  return toBrandRecord(data as BrandRow);
}
