import Header from "@/components/Header";
import Hero, { type HomeBenefit } from "@/components/Hero";
import NewArrivalsSection from "@/components/home/NewArrivalsSection";
import ShopByMood from "@/components/ShopByMood";
import Sponsored from "@/components/Sponsored";
import Footer from "@/components/Footer";
import EditableSectionFrame from "@/components/admin/EditableSectionFrame";
import PageStudioFlexibleSection from "@/components/home/PageStudioFlexibleSection";
import PageStudioProductGridSection from "@/components/home/PageStudioProductGridSection";
import { HOME_HERO, HOME_HERO_TILES, HOME_NEW_ARRIVALS, FEATURED_BRAND_AND_SPONSORED } from "@/content/home";
import { SHOP_BY_MOOD } from "@/content/shopByMood";
import { getActiveProductsByIds, getAllActiveProducts, getNewArrivals } from "@/lib/data/products";
import { getBestSellingProducts, getTrendingProducts } from "@/lib/data/collections";
import { getBrandContent, getBrandSummariesBySlug } from "@/lib/data/brands";
import { PAGE_SECTION_REGISTRY, type PageSectionRecord } from "@/lib/pageStudio/registry";
import type { ReactNode } from "react";
import type { FeaturedBrandAndSponsoredContent, HomeHeroContent, HomeHeroTilesContent, HomeProductSectionContent, ShopByMoodContent } from "@/types";

const VIEW_ALL_HREF: Record<string, string> = { new: "/new-arrivals", trending: "/trending", bestsellers: "/best-sellers", featured: "/shop/all?featured=true", all: "/shop/all" };
const FALLBACK_BENEFITS: HomeBenefit[] = [
  { title: "Curated with purpose", detail: "Handpicked local brands" },
  { title: "Secure payments", detail: "Safe & trusted checkout" },
  { title: "Fast delivery", detail: "Across Egypt" },
  { title: "Easy returns", detail: "14 days to return" },
  { title: "Support local", detail: "Empowering creators" },
];

function section(sections: PageSectionRecord[], key: string) {
  return sections.find((item) => item.sectionKey === key && item.visible);
}

function normalizeTiles(config: Record<string, unknown> | undefined): HomeHeroTilesContent {
  if (!config) return HOME_HERO_TILES;
  if (Array.isArray(config.items)) {
    const keys = ["women", "men", "kids", "home"] as const;
    const items = config.items as unknown[];
    return Object.fromEntries(keys.map((key, index) => [key, items[index] ?? HOME_HERO_TILES[key]])) as HomeHeroTilesContent;
  }
  return { ...HOME_HERO_TILES, ...config } as HomeHeroTilesContent;
}

async function productRows(config: Record<string, unknown>, allProducts: boolean) {
  const limit = Number(config.itemCount ?? config.limit ?? 10);
  if (Array.isArray(config.productIds)) return getActiveProductsByIds(config.productIds.filter((id): id is string => typeof id === "string"), limit);
  if (allProducts) return getAllActiveProducts(limit, (config.sorting as "newest" | "price-asc" | "price-desc" | "top-rated") ?? "newest", Boolean(config.featuredOnly));
  const source = String(config.source ?? "new");
  if (source === "trending") return getTrendingProducts(limit);
  if (source === "bestsellers") return getBestSellingProducts(limit);
  if (source === "all" || source === "featured") return getAllActiveProducts(limit, "newest", source === "featured");
  return getNewArrivals(limit);
}

export default async function PageStudioHomepage({ sections, editMode = false }: { sections: PageSectionRecord[]; editMode?: boolean }) {
  const heroSection = section(sections, "home_hero");
  const tileSection = section(sections, "home_hero_tiles");
  const benefitsSection = section(sections, "home_benefits");
  const rawHero = heroSection?.config ?? HOME_HERO;
  const heroContent: HomeHeroContent = {
    headingLines: Array.isArray(rawHero.headingLines) ? rawHero.headingLines.filter((line): line is string => typeof line === "string") : HOME_HERO.headingLines,
    subheading: typeof rawHero.subheading === "string" ? rawHero.subheading : HOME_HERO.subheading,
    ctaLabel: typeof rawHero.ctaLabel === "string" ? rawHero.ctaLabel : HOME_HERO.ctaLabel,
    ctaHref: typeof rawHero.ctaHref === "string" ? rawHero.ctaHref : HOME_HERO.ctaHref,
  };
  const heroTiles = normalizeTiles(tileSection?.config);
  const benefitsValue = benefitsSection?.config.items;
  const configuredBenefits = Array.isArray(benefitsValue) ? benefitsValue as HomeBenefit[] : [];
  const benefits = (configuredBenefits.length ? configuredBenefits : FALLBACK_BENEFITS).map(({ title, detail }) => ({ title, detail }));

  const renderable = sections.filter((item) => item.visible && !["home_hero", "home_hero_tiles", "home_benefits"].includes(item.sectionKey));
  const prepared = await Promise.all(renderable.map(async (item) => {
    if (["product_carousel", "product_grid", "all_products_preview", "custom_product_collection"].includes(item.sectionType)) {
      return { item, products: await productRows(item.config, item.sectionType === "all_products_preview") };
    }
    if (item.sectionType === "featured_brand") {
      const config = item.config as unknown as FeaturedBrandAndSponsoredContent;
      const [featuredBrand, sponsoredBrands] = await Promise.all([getBrandContent(config.featuredBrandSlug), getBrandSummariesBySlug(config.sponsoredBrandSlugs)]);
      return { item, featuredBrand, sponsoredBrands };
    }
    if (item.sectionType === "brand_carousel" || item.sectionType === "sponsored_brands") {
      const slugs = Array.isArray(item.config.brandSlugs) ? item.config.brandSlugs.filter((slug): slug is string => typeof slug === "string") : [];
      return { item, brands: await getBrandSummariesBySlug(slugs) };
    }
    return { item };
  }));

  const sectionIds = sections.filter((item) => item.visible).map((item) => item.id);
  const frame = (item: PageSectionRecord, node: ReactNode) => editMode ? (
    <EditableSectionFrame
      key={item.id}
      pageKey={item.pageKey}
      sectionId={item.id}
      label={PAGE_SECTION_REGISTRY[item.sectionType].label}
      editorHref={`/admin/page-studio/${item.pageKey}#section-${item.id}`}
      sectionIds={sectionIds}
      index={sectionIds.indexOf(item.id)}
      canHide={!item.isRequired}
      config={item.config}
      visible={item.visible}
    >
      {node}
    </EditableSectionFrame>
  ) : node;

  const hero = <Hero content={heroContent} tiles={heroTiles} benefits={benefits} />;

  return <main className="min-h-screen bg-cream"><Header />{heroSection ? frame(heroSection, hero) : hero}{prepared.map((entry) => {
    const { item } = entry;
    if ("products" in entry && entry.products) {
      const config = item.config as unknown as HomeProductSectionContent & { itemCount?: number; displayStyle?: string };
      const isAll = item.sectionType === "all_products_preview";
      if (item.sectionType === "product_grid" || config.displayStyle === "grid") return frame(item, <PageStudioProductGridSection key={item.id} title={config.title ?? HOME_NEW_ARRIVALS.title} products={entry.products} viewAllHref={isAll ? "/shop/all" : (VIEW_ALL_HREF[config.source] ?? "/shop/all")} />);
      return frame(item, <NewArrivalsSection key={item.id} title={config.title ?? HOME_NEW_ARRIVALS.title} products={entry.products} viewAllHref={isAll ? "/shop/all" : (VIEW_ALL_HREF[config.source] ?? "/shop/all")} />);
    }
    if (item.sectionType === "mood_tiles") {
      const value = item.config.items;
      const tiles = Array.isArray(value) ? value as ShopByMoodContent : SHOP_BY_MOOD;
      return frame(item, <ShopByMood key={item.id} tiles={tiles} />);
    }
    if ("featuredBrand" in entry) return frame(item, <Sponsored key={item.id} featuredBrand={entry.featuredBrand ?? null} sponsoredBrands={entry.sponsoredBrands ?? []} />);
    if ("brands" in entry) return frame(item, <PageStudioFlexibleSection key={item.id} type={item.sectionType} config={item.config} brands={entry.brands} />);
    if (["promotional_banner", "editorial_image", "text_block", "newsletter"].includes(item.sectionType)) return frame(item, <PageStudioFlexibleSection key={item.id} type={item.sectionType} config={item.config} />);
    return null;
  })}<Footer /></main>;
}
