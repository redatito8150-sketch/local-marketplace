// Mirrors the DB check constraint in
// supabase/migrations/20260807000005_brand_sponsorship.sql.
export const SPONSOR_PLACEMENTS = [
  "homepage_banner",
  "mega_menu_banner",
  "featured_brands_first",
] as const;
export type BrandSponsorPlacement = (typeof SPONSOR_PLACEMENTS)[number];

export interface BrandInput {
  slug: string;
  name: string;
  // Not editable from any form anymore (BrandsMegaMenu/Sponsored still read
  // it live as a fallback description) — only ever set at brand creation
  // (e.g. app/api/admin/applications/[id]/create-brand/route.ts) or left to
  // its DB default of ''.
  tagline?: string;
  category: string;
  // Extra categories beyond the primary one above — rendered as the "+N"
  // badge next to the category on the public brand page.
  additionalCategories?: string[];
  // Admin-only (BrandForm hides this field entirely in brand-portal scope)
  // — required on every brand, DB-enforced NOT NULL + format CHECK, and
  // locked (DB trigger) once the brand has any product. See
  // supabase/migrations/20260730000005_collections_and_sku_by_brand_id.sql.
  skuPrefix: string;
  isActive?: boolean;
  // Zakhnook-partner brands keep their stock in Zakhnook's own warehouse, so
  // their orders pool into one shared shipment/delivery fee with every
  // other partner brand in the same cart — see
  // supabase/migrations/20260807000001_brand_partner_fulfillment_and_order_splitting.sql.
  isMahalyPartner?: boolean;
  // Sponsorship — admin-only (hidden in brand-portal scope, same as
  // isActive/isMahalyPartner above). `sponsoredPlacements` supports more
  // than one placement at once; `sponsoredOrder` breaks ties when several
  // brands share a placement (lower = shown first / earlier in a carousel).
  isSponsored?: boolean;
  sponsoredPlacements?: BrandSponsorPlacement[];
  sponsoredOrder?: number | null;
  foundedYear?: number;
  city: string;
  // hero/logo/about images and about description are edited live on the
  // brand page (InlineEditableImage/RichTextEditableField), not through
  // this form — kept here as optional since brand-creation flows (e.g.
  // create-brand/route.ts) still set an initial placeholder value.
  heroImage?: string;
  logoImage?: string;
  aboutDescription?: string;
  aboutImage?: string;
  storyBody: string;
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
  if (!body.category?.trim()) return "Category is required";
  if (!body.skuPrefix?.trim() || !SKU_PREFIX_PATTERN.test(body.skuPrefix.trim())) {
    return "SKU Prefix is required and must be 2–6 uppercase letters/numbers";
  }
  if (!body.city?.trim()) return "City is required";
  if (!body.storyBody?.trim()) return "Story body is required";
  if (
    body.returnWindowDays != null &&
    (!Number.isInteger(body.returnWindowDays) || body.returnWindowDays <= 0)
  ) {
    return "Return window must be a whole number of days greater than 0";
  }
  if (
    body.sponsoredPlacements?.some((p) => !SPONSOR_PLACEMENTS.includes(p))
  ) {
    return "Invalid sponsorship placement";
  }
  return null;
}
