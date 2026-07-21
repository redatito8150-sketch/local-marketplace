import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/category/Breadcrumb";
import CollectionSection from "@/components/collection/CollectionSection";
import { getBestSellingProducts } from "@/lib/data/collections";

export const revalidate = 60;

export const metadata = {
  title: "Best Sellers — Mahaly",
  description: "Local's most popular products, ranked by total units sold.",
};

export default async function BestSellersPage() {
  const products = await getBestSellingProducts();

  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <Breadcrumb current="Best Sellers" />
      <CollectionSection
        eyebrow="Customer favorites"
        title="Best Sellers"
        description="Ranked by total units sold across every order placed on Local."
        products={products}
        emptyMessage="No sales data yet — check back once orders start coming in."
      />
      <Footer />
    </main>
  );
}
