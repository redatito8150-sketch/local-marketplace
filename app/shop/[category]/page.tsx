import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/category/Breadcrumb";
import CategoryHero from "@/components/category/CategoryHero";
import CollectionCards from "@/components/category/CollectionCards";
import CategoryShoppingArea from "@/components/category/CategoryShoppingArea";
import WomenCollectionHero from "@/components/category/WomenCollectionHero";
import { getCategoryContent } from "@/content/categories";
import { getProductsByCategory, getProductCountLabel } from "@/lib/data/products";
import { getSiteContentWithFallback } from "@/lib/data/siteContent";
import { buildDynamicFilterGroups } from "@/lib/filters";
import { CategoryHeroContent, CategorySlug } from "@/types";

export const revalidate = 60; // re-fetch from Supabase at most once a minute

export function generateStaticParams() {
  const categories: CategorySlug[] = ["women", "men", "kids"];
  return categories.map((category) => ({ category }));
}

async function getHero(content: { slug: CategorySlug; hero: CategoryHeroContent }) {
  const overrides = await getSiteContentWithFallback<Partial<Record<CategorySlug, CategoryHeroContent>>>(
    "category_heroes",
    {}
  );
  return overrides[content.slug] ?? content.hero;
}

export async function generateMetadata(
  props: {
    params: Promise<{ category: string }>;
  }
) {
  const params = await props.params;
  const content = getCategoryContent(params.category);
  if (!content) return {};
  const hero = await getHero(content);
  return {
    title: `${hero.title} — Mahaly`,
    description: hero.description,
  };
}

export default async function CategoryPage(
  props: {
    params: Promise<{ category: string }>;
  }
) {
  const params = await props.params;
  const content = getCategoryContent(params.category);
  if (!content) notFound();

  const [products, productCount, hero] = await Promise.all([
    getProductsByCategory(content.slug),
    getProductCountLabel(content.slug),
    getHero(content),
  ]);

  return (
    <main className="min-h-screen bg-white">
      <Header />
      {content.slug === "women" ? (
        <WomenCollectionHero products={products} />
      ) : (
        <>
          <Breadcrumb current={content.label} />
          <CategoryHero hero={hero} />
          <CollectionCards cards={content.collectionCards} />
        </>
      )}
      <CategoryShoppingArea
        filterGroups={buildDynamicFilterGroups(products)}
        products={products}
        productCount={productCount}
        featuredBrand={content.featuredBrand}
        compact={content.slug === "women"}
      />
      <Footer />
    </main>
  );
}
