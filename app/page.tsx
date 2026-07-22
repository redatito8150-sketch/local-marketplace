import PageStudioHomepage from "@/components/home/PageStudioHomepage";
import { HOME_HERO, HOME_HERO_TILES, HOME_NEW_ARRIVALS, FEATURED_BRAND_AND_SPONSORED } from "@/content/home";
import { SHOP_BY_MOOD } from "@/content/shopByMood";
import { getPublishedPageSections } from "@/lib/data/pageStudio";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import type { PageSectionRecord, PageSectionType } from "@/lib/pageStudio/registry";

export const revalidate = 60;

function fallbackSection(sectionKey: string, sectionType: PageSectionType, position: number, config: Record<string, unknown>): PageSectionRecord {
  return { id: `fallback-${sectionKey}`, pageKey: "home", sectionKey, sectionType, position, isRequired: position <= 30, config, visible: true, updatedAt: new Date(0).toISOString() };
}

async function legacyHomepageSections(): Promise<PageSectionRecord[]> {
  const [hero, tiles, arrivals, moods, featured] = await Promise.all([
    getSiteContentWithFallback("home_hero", HOME_HERO),
    getSiteContentWithFallback("home_hero_tiles", HOME_HERO_TILES),
    getSiteContentWithFallback("home_new_arrivals", HOME_NEW_ARRIVALS),
    getSiteContentWithFallback("shop_by_mood", SHOP_BY_MOOD),
    getSiteContentWithFallback("featured_brand_and_sponsored", FEATURED_BRAND_AND_SPONSORED),
  ]);
  return [
    fallbackSection("home_hero", "hero", 10, hero as unknown as Record<string, unknown>),
    fallbackSection("home_hero_tiles", "category_cards", 20, tiles as unknown as Record<string, unknown>),
    fallbackSection("home_benefits", "benefits_strip", 30, { items: [] }),
    fallbackSection("home_new_arrivals", "product_carousel", 40, arrivals as unknown as Record<string, unknown>),
    fallbackSection("home_all_products", "all_products_preview", 50, { title: "Explore All Products", itemCount: 10, sorting: "newest", featuredOnly: false, displayStyle: "carousel" }),
    fallbackSection("shop_by_mood", "mood_tiles", 60, { items: moods }),
    fallbackSection("featured_brand_and_sponsored", "featured_brand", 70, featured as unknown as Record<string, unknown>),
  ];
}

export default async function Home() {
  const published = await getPublishedPageSections("home").catch(() => []);
  return <PageStudioHomepage sections={published.length ? published : await legacyHomepageSections()} />;
}
