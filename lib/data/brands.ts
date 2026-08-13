import { supabase } from "@/lib/supabase/client";
import { logError } from "@/lib/errorLog";
import { getFollowerCountForBrand } from "@/lib/data/follows";
import { getVariantsForProducts } from "@/lib/data/variants";
import { isWithinNewBrandWindow } from "@/lib/brandNewWindow";
import { publishDateLiveFilter } from "@/lib/newArrivals";
import { PRODUCT_PUBLIC_SELECT, ProductRow, toProductCard, loadDisplayContext, attachVariantDerivedFields } from "@/lib/data/products";
import {
  BrandPageContent,
  BrandJourneyMilestone,
  BrandImageField,
  BrandFounder,
} from "@/types";

interface BrandRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  additional_categories: string[] | null;
  founded_year: number | null;
  city: string;
  hero_image: string;
  logo_image: string | null;
  about_description: string;
  about_image: string;
  story_body: string;
  is_mahaly_partner: boolean;
  created_at: string;
  founders: BrandFounder[] | null;
  journey_milestones: BrandJourneyMilestone[] | null;
  about_headline: string | null;
  about_quote: string | null;
  collections_page_title: string | null;
  collections_detail_eyebrow: string | null;
  collections_detail_heading: string | null;
}

const BRAND_PUBLIC_SELECT =
  "id, slug, name, tagline, category, additional_categories, founded_year, city, hero_image, logo_image, about_description, about_image, story_body, is_mahaly_partner, created_at, founders, journey_milestones, about_headline, about_quote, collections_page_title, collections_detail_eyebrow, collections_detail_heading" as const;

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
    .select(BRAND_PUBLIC_SELECT)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`getBrandContent(${slug}) failed: ${error.message}`);
  }
  if (!brandRow) return null;
  const brand = brandRow as BrandRow;

  const { data: editMetadataRows } = await supabase.rpc(
    "get_my_brand_edit_metadata",
    { p_brand_slug: slug }
  );
  const editMetadata = (editMetadataRows?.[0] ?? null) as {
    deleted_image_backups: Partial<Record<BrandImageField, string>> | null;
    source_application_id: string | null;
  } | null;

  const { data: productRows, error: productsError } = await supabase
    .from("storefront_products")
    .select(PRODUCT_PUBLIC_SELECT)
    .eq("brand_slug", slug)
    .eq("status", "published")
    .eq("paused_by_brand", false)
    .or(publishDateLiveFilter());

  if (productsError) {
    throw new Error(
      `getBrandContent(${slug}) products query failed: ${productsError.message}`
    );
  }

  // The "Collections" stat on BrandProfileHeader — real published-collection
  // count, replacing the old shop_the_look.length (which never reflected
  // anything real). Supplementary — degrades quietly to 0 rather than
  // failing the whole brand page if this secondary lookup breaks.
  const { count: collectionsCount, error: collectionsCountError } = await supabase
    .from("collections")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brand.id)
    .eq("is_active", true)
    .not("published_at", "is", null);
  if (collectionsCountError) {
    logError(`getBrandContent(${slug}) collections count query failed`, collectionsCountError.message);
  }

  const productRowsTyped = (productRows ?? []) as ProductRow[];
  // Full Product shape (not the old lightweight BrandProduct) so the real
  // filter/sort system and the storefront's own ProductCard — with working
  // Add to Cart and star ratings — can be reused verbatim on brand pages.
  const displayCtx = await loadDisplayContext(productRowsTyped);
  const productCards = productRowsTyped.map((row) => toProductCard(row, displayCtx));
  const variantsByProduct = await getVariantsForProducts(productCards.map((c) => c.id));
  // attachVariantDerivedFields, not a plain spread — sizes/colors/inStock
  // are computed from the live variant set (see its doc comment in
  // lib/data/products.ts), not carried by toProductCard itself. Spreading
  // variants on top without it left every brand-page product card with no
  // colors shown at all.
  const products = productCards.map((c) => attachVariantDerivedFields(c, variantsByProduct.get(c.id) ?? []));

  // brand_follows has no public policy, so the count needs supabaseAdmin —
  // degrades quietly to 0 rather than failing the whole page if it errors.
  const followerCount = await getFollowerCountForBrand(slug).catch((err) => {
    logError(`getBrandContent(${slug}) follower count failed`, err.message);
    return 0;
  });

  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    tagline: brand.tagline,
    category: brand.category,
    additionalCategories: brand.additional_categories ?? [],
    foundedYear: brand.founded_year ?? undefined,
    city: brand.city,
    createdAt: brand.created_at,
    heroImage: brand.hero_image,
    logoImage: brand.logo_image ?? undefined,
    aboutDescription: brand.about_description,
    aboutImage: brand.about_image,
    products,
    storyBody: brand.story_body,
    followerCount,
    storeRating: computeStoreRating(productRowsTyped),
    collectionsCount: collectionsCount ?? 0,
    isMahalyPartner: Boolean(brand.is_mahaly_partner),
    founders: brand.founders ?? [],
    journeyMilestones: brand.journey_milestones ?? [],
    deletedImageBackups: editMetadata?.deleted_image_backups ?? {},
    aboutHeadline: brand.about_headline ?? undefined,
    aboutQuote: brand.about_quote ?? undefined,
    hasSourceApplication: Boolean(editMetadata?.source_application_id),
    collectionsPageTitle: brand.collections_page_title ?? undefined,
    collectionsDetailEyebrow: brand.collections_detail_eyebrow ?? undefined,
    collectionsDetailHeading: brand.collections_detail_heading ?? undefined,
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
  logoImage: string | null;
  category: string;
  additionalCategories: string[];
  city: string;
  createdAt: string;
  followerCount: number;
  isMahalyPartner: boolean;
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

export interface BrandFulfillmentFlag {
  slug: string;
  name: string;
  isMahalyPartner: boolean;
}

// Used by the cart/checkout client pages to group items by shipment and
// preview the resulting delivery-fee split before placing an order — the
// authoritative split itself is still computed server-side in place_order,
// this is display-only.
export async function getBrandFulfillmentFlags(slugs: string[]): Promise<BrandFulfillmentFlag[]> {
  if (slugs.length === 0) return [];
  const { data, error } = await supabase
    .from("brands")
    .select("slug, name, is_mahaly_partner")
    .in("slug", slugs);

  if (error) {
    throw new Error(`getBrandFulfillmentFlags failed: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    name: r.name as string,
    isMahalyPartner: Boolean(r.is_mahaly_partner),
  }));
}

export async function getFeaturedBrands(): Promise<FeaturedBrandSummary[]> {
  const { data, error } = await supabase
    .from("brands")
    .select("slug, name, hero_image, logo_image, category, additional_categories, city, created_at, is_mahaly_partner")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getFeaturedBrands failed: ${error.message}`);
  }
  const rows = data ?? [];
  const followerCounts = await Promise.all(
    rows.map((row) =>
      getFollowerCountForBrand(row.slug as string).catch((countError) => {
        logError(`getFeaturedBrands(${row.slug}) follower count failed`, countError.message);
        return 0;
      })
    )
  );

  return rows.map((r, index) => ({
    slug: r.slug as string,
    name: r.name as string,
    thumbnail: r.hero_image as string,
    logoImage: (r.logo_image as string | null) ?? null,
    category: r.category as string,
    additionalCategories: (r.additional_categories as string[] | null) ?? [],
    city: r.city as string,
    createdAt: r.created_at as string,
    followerCount: followerCounts[index],
    isMahalyPartner: Boolean(r.is_mahaly_partner),
  }));
}

export interface MenuFeaturedBrand extends Pick<
  FeaturedBrandSummary,
  "name" | "slug" | "thumbnail" | "isMahalyPartner"
> {
  isNew: boolean;
  isMahalyPartner: boolean;
  // Pinned via the "featured_brands_first" sponsorship placement — drives
  // the gold highlight around this brand's own avatar in the menu.
  isSponsored: boolean;
}

const FEATURED_BRANDS_MENU_LIMIT = 6;

interface FeaturedMenuRow {
  slug: string;
  name: string;
  hero_image: string;
  created_at: string;
  is_mahaly_partner: boolean;
  is_sponsored: boolean;
  sponsored_placements: string[];
  sponsored_order: number | null;
}

// The mega menu's "Featured Brands" column — real, auto-ranked data
// instead of the old hardcoded (and stale/deleted-brand) FEATURED_BRANDS
// array in content/navigation.ts. Priority, in order:
//  1. Sponsored brands pinned to "featured_brands_first", by sponsored_order.
//  2. "New" brands (lib/brandNewWindow.ts — 30 days from created_at),
//     newest first. A brand keeps its slot after the window passes (just
//     loses the badge) — it's only displaced by (1)/(2) ranking above it
//     or the slot cap below.
//  3. Whatever slots remain: every other active brand, Zakhnook-partner
//     brands ranked first within this tier, then a daily-rotating offset
//     into the (stably sorted) remaining pool — so which brands show up
//     here shifts by one each day and, over enough days, every brand in
//     the pool gets shown. No cron job / stored state: purely a function
//     of "now", same as the discount system elsewhere in this codebase.
export async function getFeaturedBrandsForMenu(limit = FEATURED_BRANDS_MENU_LIMIT): Promise<MenuFeaturedBrand[]> {
  const { data, error } = await supabase
    .from("brands")
    .select("slug, name, hero_image, created_at, is_mahaly_partner, is_sponsored, sponsored_placements, sponsored_order")
    .eq("is_active", true);

  if (error) {
    throw new Error(`getFeaturedBrandsForMenu failed: ${error.message}`);
  }
  const rows = (data ?? []) as FeaturedMenuRow[];

  const sponsored = rows
    .filter((r) => r.is_sponsored && r.sponsored_placements.includes("featured_brands_first"))
    .sort((a, b) => (a.sponsored_order ?? Number.MAX_SAFE_INTEGER) - (b.sponsored_order ?? Number.MAX_SAFE_INTEGER));
  const usedSlugs = new Set(sponsored.map((r) => r.slug));

  const newBrands = rows
    .filter((r) => !usedSlugs.has(r.slug) && isWithinNewBrandWindow(r.created_at, true))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  for (const r of newBrands) usedSlugs.add(r.slug);

  const remainingSlots = Math.max(0, limit - sponsored.length - newBrands.length);
  let fill: FeaturedMenuRow[] = [];
  if (remainingSlots > 0) {
    const pool = rows
      .filter((r) => !usedSlugs.has(r.slug))
      .sort((a, b) => {
        if (a.is_mahaly_partner !== b.is_mahaly_partner) return a.is_mahaly_partner ? -1 : 1;
        return a.slug.localeCompare(b.slug);
      });
    if (pool.length > 0) {
      const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
      const offset = dayIndex % pool.length;
      const rotated = [...pool.slice(offset), ...pool.slice(0, offset)];
      fill = rotated.slice(0, remainingSlots);
    }
  }

  const newSlugs = new Set(newBrands.map((r) => r.slug));
  const sponsoredSlugs = new Set(sponsored.map((r) => r.slug));
  return [...sponsored, ...newBrands, ...fill].slice(0, limit).map((r) => ({
    slug: r.slug,
    name: r.name,
    thumbnail: r.hero_image,
    isNew: newSlugs.has(r.slug),
    isMahalyPartner: r.is_mahaly_partner,
    isSponsored: sponsoredSlugs.has(r.slug),
  }));
}

export type BrandSponsorPlacement = "homepage_banner" | "mega_menu_banner" | "featured_brands_first";

export interface SponsoredBrandSlide {
  slug: string;
  name: string;
  tagline: string;
  aboutDescription: string;
  heroImage: string;
  isMahalyPartner: boolean;
}

// Real content for the two carousel spots (homepage end-of-page section,
// mega menu's right-side banner) — every brand with this placement in its
// sponsored_placements, ordered by sponsored_order. Empty when nothing is
// configured, so callers can fall back to their own static default.
export async function getSponsoredBrandsForPlacement(placement: BrandSponsorPlacement): Promise<SponsoredBrandSlide[]> {
  const { data, error } = await supabase
    .from("brands")
    .select("slug, name, tagline, hero_image, about_description, sponsored_order, is_mahaly_partner")
    .eq("is_active", true)
    .eq("is_sponsored", true)
    .contains("sponsored_placements", [placement])
    .order("sponsored_order", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(`getSponsoredBrandsForPlacement(${placement}) failed: ${error.message}`);
  }
  return (data ?? []).map((r) => ({
    slug: r.slug as string,
    name: r.name as string,
    tagline: r.tagline as string,
    aboutDescription: r.about_description as string,
    heroImage: r.hero_image as string,
    isMahalyPartner: Boolean(r.is_mahaly_partner),
  }));
}
