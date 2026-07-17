import { notFound } from "next/navigation";
import Header from "@/components/Header";
import BrandHero from "@/components/brand/BrandHero";
import AboutBrand from "@/components/brand/AboutBrand";
import CategoryNav from "@/components/brand/CategoryNav";
import BrandProductGrid from "@/components/brand/BrandProductGrid";
import OurStory from "@/components/brand/OurStory";
import ValuesSection from "@/components/brand/ValuesSection";
import SimilarBrands from "@/components/brand/SimilarBrands";
import BrandFooter from "@/components/brand/BrandFooter";
import { getBrandContent, BRANDS } from "@/data/brand";

export function generateStaticParams() {
  return Object.keys(BRANDS).map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const brand = getBrandContent(params.slug);
  if (!brand) return {};
  return {
    title: `${brand.name} — LOCAL`,
    description: brand.tagline,
  };
}

export default function BrandPage({ params }: { params: { slug: string } }) {
  const brand = getBrandContent(params.slug);
  if (!brand) notFound();

  return (
    <main className="min-h-screen bg-white">
      <Header />
      <BrandHero brand={brand} />
      <AboutBrand brand={brand} />
      <CategoryNav tabs={brand.categoryTabs} defaultActive={brand.activeTab} />
      <BrandProductGrid brandName={brand.name} products={brand.products} />
      <OurStory image={brand.storyImage} body={brand.storyBody} />
      <ValuesSection values={brand.values} />
      <SimilarBrands brands={brand.similarBrands} />
      <BrandFooter />
    </main>
  );
}
