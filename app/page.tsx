import PageStudioHomepage from "@/components/home/PageStudioHomepage";
import { HOME_HERO, HOME_HERO_TILES } from "@/content/home";
import { SHOP_BY_MOOD } from "@/content/shopByMood";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { getActiveProductsByIds } from "@/lib/data/products";
import type { PageSectionRecord, PageSectionType } from "@/lib/pageStudio/registry";
import type { ResolvedMoodTile, ShopByMoodContent } from "@/types";

// Was `dynamic = "force-static"` — fully frozen at build time with no
// time-based refresh, relying entirely on the admin's Page Studio/Shop by
// Mood "publish" actions calling revalidatePath("/") to ever update. That
// meant a brand's own new/scheduled product (nothing to do with Page
// Studio) could never appear here until the next full redeploy, even long
// after its Publish Date passed. ISR with the same 60s window used
// elsewhere (getNewArrivals, /new-arrivals, /product/[id]) fixes that,
// while the existing revalidatePath("/") calls still force an immediate
// refresh on top of it.
export const revalidate = 60;

function fallbackSection(sectionKey: string, sectionType: PageSectionType, position: number, config: Record<string, unknown>): PageSectionRecord {
  return { id: `fallback-${sectionKey}`, pageKey: "home", sectionKey, sectionType, position, isRequired: position <= 30, config, visible: true, updatedAt: new Date(0).toISOString() };
}

function localDesignSections(moodTiles: ResolvedMoodTile[]): PageSectionRecord[] {
  return [
    fallbackSection("home_hero", "hero", 10, HOME_HERO as unknown as Record<string, unknown>),
    fallbackSection("home_hero_tiles", "category_cards", 20, HOME_HERO_TILES as unknown as Record<string, unknown>),
    fallbackSection("home_benefits", "benefits_strip", 30, { items: [] }),
    fallbackSection("shop_by_mood", "mood_tiles", 60, { items: moodTiles }),
  ];
}

// The admin's Shop by Mood picks are stored as productIds only (see
// types/index.ts's MoodTileContent) — resolved into real, live Product
// rows here so a product edited/unpublished elsewhere is always reflected,
// never denormalized into the saved content itself.
async function resolveMoodTiles(): Promise<ResolvedMoodTile[]> {
  const tiles = await getSiteContentWithFallback<ShopByMoodContent>("shop_by_mood", SHOP_BY_MOOD);
  return Promise.all(
    tiles.map(async (tile) => ({
      ...tile,
      products: await getActiveProductsByIds(tile.productIds, Math.max(1, tile.productIds.length)),
    }))
  );
}

export default async function Home() {
  const moodTiles = await resolveMoodTiles();
  return <PageStudioHomepage sections={localDesignSections(moodTiles)} />;
}
