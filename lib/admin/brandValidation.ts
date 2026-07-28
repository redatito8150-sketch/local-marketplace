import type { BrandInfoBadge, BrandCategoryTab, BrandValue, BrandShopTheLookTile } from "@/types";

export interface BrandInput {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  // Admin-only (BrandForm hides this field entirely in brand-portal scope)
  // — required before the brand can create a product via the server-
  // generated SKU path, see supabase/migrations/20260729000003_sku_and_collections.sql.
  skuPrefix?: string;
  foundedYear?: number;
  city: string;
  heroImage: string;
  logoImage?: string;
  websiteUrl?: string;
  aboutDescription: string;
  aboutImage: string;
  storyImage: string;
  storyImage2?: string;
  storyBody: string;
  infoBadges: BrandInfoBadge[];
  categoryTabs: BrandCategoryTab[];
  activeTab: string;
  values: BrandValue[];
  similarBrandSlugs: string[];
  shopTheLook: BrandShopTheLookTile[];
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKU_PREFIX_PATTERN = /^[A-Z0-9]{2,6}$/;

export function validateBrandInput(body: BrandInput): string | null {
  if (!body.slug?.trim() || !SLUG_PATTERN.test(body.slug.trim())) {
    return "Slug is required and must be lowercase letters, numbers, and hyphens only";
  }
  if (!body.name?.trim()) return "Name is required";
  if (!body.tagline?.trim()) return "Tagline is required";
  if (!body.category?.trim()) return "Category is required";
  if (body.skuPrefix?.trim() && !SKU_PREFIX_PATTERN.test(body.skuPrefix.trim())) {
    return "SKU Prefix must be 2–6 uppercase letters/numbers";
  }
  if (!body.city?.trim()) return "City is required";
  if (!body.heroImage?.trim()) return "Hero image URL is required";
  if (!body.aboutDescription?.trim()) return "About description is required";
  if (!body.aboutImage?.trim()) return "About image URL is required";
  if (!body.storyImage?.trim()) return "Story image URL is required";
  if (!body.storyBody?.trim()) return "Story body is required";
  return null;
}
