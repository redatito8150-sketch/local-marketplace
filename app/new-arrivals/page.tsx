import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/category/Breadcrumb";
import CollectionSection from "@/components/collection/CollectionSection";
import { getNewArrivals } from "@/lib/data/products";

export const revalidate = 60;

export const metadata = {
  title: "New Arrivals — Mahaly",
  description: "The newest pieces from Local's independent Egyptian brands.",
};

export default async function NewArrivalsPage() {
  const products = await getNewArrivals();

  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <Breadcrumb current="New Arrivals" />
      <CollectionSection
        eyebrow="Just landed"
        title="New Arrivals"
        description="Fresh pieces from Local's independent brands, marked new by the brands themselves."
        products={products}
        emptyMessage="No new arrivals right now — check back soon."
      />
      <Footer />
    </main>
  );
}
