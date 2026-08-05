import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DealsExperience from "@/components/offers/DealsExperience";
import { getMarketplaceCatalogPage } from "@/lib/data/products";

export const metadata: Metadata = {
  title: "Deals — Mahaly",
  description: "Limited-time prices from Mahaly's independent local brands.",
};

export const revalidate = 60;

export default async function OffersPage() {
  const result = await getMarketplaceCatalogPage({
    pageSize: 24,
    sort: "newest",
    filters: { discounted: ["discounted-only"] },
  });

  return (
    <main className="min-h-screen bg-[#f7f3ee]">
      <Header />
      <DealsExperience products={result.products} />
      <Footer />
    </main>
  );
}
