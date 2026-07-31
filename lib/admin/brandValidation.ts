import type { BrandInfoBadge, BrandCategoryTab, BrandValue, BrandShopTheLookTile } from "@/types";

export interface BrandInput {
  slug: string;
  name: string;
  tagline: string;
  category: string;
  // Admin-only (BrandForm hides this field entirely in brand-portal scope)
  // — required on every brand, DB-enforced NOT NULL + format CHECK, and
  // locked (DB trigger) once the brand has any product. See
  // supabase/migrations/20260730000005_collections_and_sku_by_brand_id.sql.
  skuPrefix: string;
  isActive?: boolean;
  // Mahaly-partner brands keep their stock in Mahaly's own warehouse, so
  // their orders pool into one shared shipment/delivery fee with every
  // other partner brand in the same cart — see
  // supabase/migrations/20260807000001_brand_partner_fulfillment_and_order_splitting.sql.
  isMahalyPartner?: boolean;
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
  // Shipping & Returns policy priority source — all optional; an unset
  // brand falls back to the marketplace default (see lib/admin/shippingPolicy.ts).
  shippingPolicy?: string;
  returnPolicy?: string;
  returnWindowDays?: number;
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
  if (!body.skuPrefix?.trim() || !SKU_PREFIX_PATTERN.test(body.skuPrefix.trim())) {
    return "SKU Prefix is required and must be 2–6 uppercase letters/numbers";
  }
  if (!body.city?.trim()) return "City is required";
  if (!body.heroImage?.trim()) return "Hero image URL is required";
  if (!body.aboutDescription?.trim()) return "About description is required";
  if (!body.aboutImage?.trim()) return "About image URL is required";
  if (!body.storyImage?.trim()) return "Story image URL is required";
  if (!body.storyBody?.trim()) return "Story body is required";
  if (
    body.returnWindowDays != null &&
    (!Number.isInteger(body.returnWindowDays) || body.returnWindowDays <= 0)
  ) {
    return "Return window must be a whole number of days greater than 0";
  }
  return null;
}
