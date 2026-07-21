import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/category/Breadcrumb";
import CollectionSection from "@/components/collection/CollectionSection";
import { getTrendingProducts } from "@/lib/data/collections";

export const revalidate = 60;

export const metadata = {
  title: "Trending — Mahaly",
  description: "What's picking up the most orders on Local right now.",
};

export default async function TrendingPage() {
  const products = await getTrendingProducts();

  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <Breadcrumb current="Trending" />
      <CollectionSection
        eyebrow="Picking up now"
        title="Trending"
        description="Ranked by units sold in the last 30 days."
        products={products}
        emptyMessage="Nothing trending yet — check back once more orders come in."
      />
      <Footer />
    </main>
  );
}
