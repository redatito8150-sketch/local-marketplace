import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ExploreBoards from "@/components/ExploreBoards";
import Sponsored from "@/components/Sponsored";
import Footer from "@/components/Footer";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { HOME_HERO, HOME_HERO_TILES } from "@/content/home";

export const revalidate = 60; // re-fetch site_content from Supabase at most once a minute

export default async function Home() {
  const [heroContent, heroTiles] = await Promise.all([
    getSiteContentWithFallback("home_hero", HOME_HERO),
    getSiteContentWithFallback("home_hero_tiles", HOME_HERO_TILES),
  ]);

  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <Hero content={heroContent} tiles={heroTiles} />
      <ExploreBoards />
      <Sponsored />
      <Footer />
    </main>
  );
}
