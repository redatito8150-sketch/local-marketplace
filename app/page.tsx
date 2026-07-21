import Header from "@/components/Header";
import Hero from "@/components/Hero";
import NewArrivalsSection from "@/components/home/NewArrivalsSection";
import ShopByMood from "@/components/ShopByMood";
import Sponsored from "@/components/Sponsored";
import Footer from "@/components/Footer";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import {
  HOME_HERO,
  HOME_HERO_TILES,
  HOME_NEW_ARRIVALS,
  FEATURED_BRAND_AND_SPONSORED,
} from "@/content/home";
import { SHOP_BY_MOOD } from "@/content/shopByMood";
import { getNewArrivals } from "@/lib/data/products";
import { getTrendingProducts, getBestSellingProducts } from "@/lib/data/collections";
import { getBrandContent, getBrandSummariesBySlug } from "@/lib/data/brands";
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
  const [heroContent, heroTiles, productSection, moodTiles, featuredAndSponsored] =
    await Promise.all([
      getSiteContentWithFallback("home_hero", HOME_HERO),
      getSiteContentWithFallback("home_hero_tiles", HOME_HERO_TILES),
      getSiteContentWithFallback("home_new_arrivals", HOME_NEW_ARRIVALS),
      getSiteContentWithFallback("shop_by_mood", SHOP_BY_MOOD),
      getSiteContentWithFallback("featured_brand_and_sponsored", FEATURED_BRAND_AND_SPONSORED),
    ]);
  const [productSectionItems, featuredBrand, sponsoredBrands] = await Promise.all([
    getProductSectionProducts(productSection),
    getBrandContent(featuredAndSponsored.featuredBrandSlug),
    getBrandSummariesBySlug(featuredAndSponsored.sponsoredBrandSlugs),
  ]);

  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <Hero content={heroContent} tiles={heroTiles} />
      <NewArrivalsSection
        title={productSection.title}
        products={productSectionItems}
        viewAllHref={VIEW_ALL_HREF[productSection.source]}
      />
      <ShopByMood tiles={moodTiles} />
      <Sponsored featuredBrand={featuredBrand} sponsoredBrands={sponsoredBrands} />
      <Footer />
    </main>
  );
}
