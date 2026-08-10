import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DealsExperience from "@/components/offers/DealsExperience";
import { getMarketplaceCatalogPage } from "@/lib/data/products";

export const metadata: Metadata = {
  title: "Sales — Zakhnook",
  description: "Limited-time prices from Zakhnook's independent local brands.",
};

export const revalidate = 60;

export default async function SalesPage() {
  const result = await getMarketplaceCatalogPage({
    pageSize: 24,
    sort: "newest",
    filters: { discounted: ["discounted-only"] },
  });

  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full bg-cream">
      <Header />
      <DealsExperience products={result.products} />
      <Footer />
    </main>
  );
}
