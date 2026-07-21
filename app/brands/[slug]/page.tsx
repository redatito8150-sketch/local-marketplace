import { Suspense } from "react";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import BrandHero from "@/components/brand/BrandHero";
import BrandStatsBand from "@/components/brand/BrandStatsBand";
import AboutBrand from "@/components/brand/AboutBrand";
import ShopTheLook from "@/components/brand/ShopTheLook";
import BrandBestSellers from "@/components/brand/BrandBestSellers";
import BrandShoppingArea from "@/components/brand/BrandShoppingArea";
import OurStory from "@/components/brand/OurStory";
import ValuesSection from "@/components/brand/ValuesSection";
import BrandFeaturesRow from "@/components/brand/BrandFeaturesRow";
import SimilarBrands from "@/components/brand/SimilarBrands";
import BrandFooter from "@/components/brand/BrandFooter";
import { getBrandContent, getAllBrandSlugs } from "@/lib/data/brands";
import { getBestSellingProductsForBrand } from "@/lib/data/collections";
import { buildDynamicFilterGroups } from "@/lib/filters";

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs = await getAllBrandSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const brand = await getBrandContent(params.slug);
  if (!brand) return {};
  return {
    title: `${brand.name} — LOCAL`,
    description: brand.tagline,
  };
}

export default async function BrandPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const brand = await getBrandContent(params.slug);
  if (!brand) notFound();

  const bestSellers = await getBestSellingProductsForBrand(params.slug);
  // Already scoped to this one brand, so the "Brand" filter dimension
  // would just show a single, always-checked option — drop it rather than
  // touching buildDynamicFilterGroups's signature (keeps /shop/[category]
  // untouched).
  const filterGroups = buildDynamicFilterGroups(brand.products).filter((g) => g.id !== "brand");

  return (
    <main className="min-h-screen bg-white">
      <Header />
      <BrandHero brand={brand} />
      <BrandStatsBand
        foundedYear={brand.foundedYear}
        city={brand.city}
        productCount={brand.products.length}
        followerCount={brand.followerCount}
        storeRating={brand.storeRating}
      />
      <AboutBrand brand={brand} />
      <ShopTheLook tiles={brand.shopTheLook} />
      <BrandBestSellers products={bestSellers} />
      <Suspense fallback={null}>
        <BrandShoppingArea
          brandName={brand.name}
          products={brand.products}
          filterGroups={filterGroups}
          categoryTabs={brand.categoryTabs}
          defaultActiveTab={brand.activeTab}
        />
      </Suspense>
      <OurStory
        image={brand.storyImage}
        image2={brand.storyImage2}
        body={brand.storyBody}
      />
      <ValuesSection values={brand.values} />
      <BrandFeaturesRow />
      <SimilarBrands brands={brand.similarBrands} />
      <BrandFooter />
    </main>
  );
}
