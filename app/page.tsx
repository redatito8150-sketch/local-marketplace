import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ExploreBoards from "@/components/ExploreBoards";
import Sponsored from "@/components/Sponsored";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <Hero />
      <ExploreBoards />
      <Sponsored />
      <Footer />
    </main>
  );
}
