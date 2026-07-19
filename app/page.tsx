import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ExploreBoards from "@/components/ExploreBoards";
import Sponsored from "@/components/Sponsored";
import Footer from "@/components/Footer";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { HOME_HERO } from "@/content/home";

export const revalidate = 60; // re-fetch site_content from Supabase at most once a minute

export default async function Home() {
  const heroContent = await getSiteContentWithFallback("home_hero", HOME_HERO);

  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <Hero content={heroContent} />
      <ExploreBoards />
      <Sponsored />
      <Footer />
    </main>
  );
}
