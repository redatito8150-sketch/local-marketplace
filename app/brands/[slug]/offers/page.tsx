import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OffersExperience from "@/components/brand/OffersExperience";
import BrandEmptyState from "@/components/brand/BrandEmptyState";
import { getBrandContent } from "@/lib/data/brands";
import { isActiveOffer } from "@/lib/brandProfile";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const brand = await getBrandContent(slug);
  return brand ? { title: `${brand.name} Offers & Discounts | Mahaly`, description: `Discover current offers from ${brand.name}.` } : {};
}
export default async function OffersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const brand = await getBrandContent(slug); if (!brand) notFound();
  const offers = brand.products.filter(isActiveOffer);
  return <section className="mx-auto max-w-brand px-5 py-10 sm:px-6 lg:px-10 lg:py-16">{offers.length ? <OffersExperience brandName={brand.name} products={offers} /> : <BrandEmptyState title="No active offers right now" description="Follow this brand to keep it close, and return when its next special edit launches." href={`/brands/${slug}/products`} action="Explore Products" />}</section>;
}
