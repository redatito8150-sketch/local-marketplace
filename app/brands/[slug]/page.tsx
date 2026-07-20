import { notFound } from "next/navigation";
import Header from "@/components/Header";
import BrandHero from "@/components/brand/BrandHero";
import BrandStatsBand from "@/components/brand/BrandStatsBand";
import AboutBrand from "@/components/brand/AboutBrand";
import CategoryNav from "@/components/brand/CategoryNav";
import BrandProductGrid from "@/components/brand/BrandProductGrid";
import OurStory from "@/components/brand/OurStory";
import ValuesSection from "@/components/brand/ValuesSection";
import SimilarBrands from "@/components/brand/SimilarBrands";
import BrandFooter from "@/components/brand/BrandFooter";
import { getBrandContent, getAllBrandSlugs } from "@/lib/data/brands";
import { isUserFollowingBrand } from "@/lib/data/follows";
import { requireUser } from "@/lib/supabase/accountAuth";

export const revalidate = 60;

export async function generateStaticParams() {
  const slugs = await getAllBrandSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const brand = await getBrandContent(params.slug);
  if (!brand) return {};
  return {
    title: `${brand.name} — LOCAL`,
    description: brand.tagline,
  };
}

export default async function BrandPage({ params }: { params: { slug: string } }) {
  const brand = await getBrandContent(params.slug);
  if (!brand) notFound();

  const user = await requireUser();
  const isFollowing = user ? await isUserFollowingBrand(user.id, params.slug) : false;

  return (
    <main className="min-h-screen bg-white">
      <Header />
      <BrandHero brand={brand} isFollowing={isFollowing} signedIn={Boolean(user)} />
      <BrandStatsBand
        foundedYear={brand.foundedYear}
        city={brand.city}
        productCount={brand.products.length}
        followerCount={brand.followerCount}
        storeRating={brand.storeRating}
      />
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
