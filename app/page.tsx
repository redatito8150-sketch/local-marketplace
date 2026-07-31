import PageStudioHomepage from "@/components/home/PageStudioHomepage";
import { HOME_HERO, HOME_HERO_TILES } from "@/content/home";
import { SHOP_BY_MOOD } from "@/content/shopByMood";
import type { PageSectionRecord, PageSectionType } from "@/lib/pageStudio/registry";

export const dynamic = "force-static";

function fallbackSection(sectionKey: string, sectionType: PageSectionType, position: number, config: Record<string, unknown>): PageSectionRecord {
  return { id: `fallback-${sectionKey}`, pageKey: "home", sectionKey, sectionType, position, isRequired: position <= 30, config, visible: true, updatedAt: new Date(0).toISOString() };
}

function localDesignSections(): PageSectionRecord[] {
  return [
    fallbackSection("home_hero", "hero", 10, HOME_HERO as unknown as Record<string, unknown>),
    fallbackSection("home_hero_tiles", "category_cards", 20, HOME_HERO_TILES as unknown as Record<string, unknown>),
    fallbackSection("home_benefits", "benefits_strip", 30, { items: [] }),
    fallbackSection("shop_by_mood", "mood_tiles", 60, { items: SHOP_BY_MOOD }),
  ];
}

export default function Home() {
  return <PageStudioHomepage sections={localDesignSections()} />;
}
