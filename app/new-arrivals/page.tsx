import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NewArrivalsExperience from "@/components/new-arrivals/NewArrivalsExperience";
import { getMarketplaceCatalogPage, getNewArrivals } from "@/lib/data/products";

export const revalidate = 60;

export const metadata = {
  title: "New Arrivals — Mahaly",
  description: "The newest pieces from Mahaly's independent Egyptian brands.",
};

export default async function NewArrivalsPage() {
  const newArrivals = await getNewArrivals();
  const products = newArrivals.length
    ? newArrivals
    : (await getMarketplaceCatalogPage({ pageSize: 24, sort: "newest" })).products;

  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full bg-[#f7f3ee]">
      <Header />
      <NewArrivalsExperience products={products} />
      <Footer />
    </main>
  );
}
