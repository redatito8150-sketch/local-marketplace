import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ExploreBoards from "@/components/ExploreBoards";
import NewArrivalsSection from "@/components/home/NewArrivalsSection";
import Sponsored from "@/components/Sponsored";
import Footer from "@/components/Footer";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { HOME_HERO, HOME_HERO_TILES, HOME_NEW_ARRIVALS } from "@/content/home";
import { getNewArrivals } from "@/lib/data/products";
import { getTrendingProducts, getBestSellingProducts } from "@/lib/data/collections";
import type { HomeProductSectionContent } from "@/types";

export const revalidate = 60; // re-fetch site_content from Supabase at most once a minute

const VIEW_ALL_HREF: Record<HomeProductSectionContent["source"], string> = {
  new: "/new-arrivals",
  trending: "/trending",
  bestsellers: "/best-sellers",
};

async function getProductSectionProducts(section: HomeProductSectionContent) {
  if (section.source === "trending") return getTrendingProducts(section.limit);
  if (section.source === "bestsellers") return getBestSellingProducts(section.limit);
  return getNewArrivals(section.limit);
}

export default async function Home() {
  const [heroContent, heroTiles, productSection] = await Promise.all([
    getSiteContentWithFallback("home_hero", HOME_HERO),
    getSiteContentWithFallback("home_hero_tiles", HOME_HERO_TILES),
    getSiteContentWithFallback("home_new_arrivals", HOME_NEW_ARRIVALS),
  ]);
  const productSectionItems = await getProductSectionProducts(productSection);

  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <Hero content={heroContent} tiles={heroTiles} />
      <NewArrivalsSection
        title={productSection.title}
        products={productSectionItems}
        viewAllHref={VIEW_ALL_HREF[productSection.source]}
      />
      <ExploreBoards />
      <Sponsored />
      <Footer />
    </main>
  );
}
