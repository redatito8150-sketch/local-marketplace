import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/category/Breadcrumb";
import CategoryHero from "@/components/category/CategoryHero";
import CollectionCards from "@/components/category/CollectionCards";
import CategoryShoppingArea from "@/components/category/CategoryShoppingArea";
import { getCategoryContent } from "@/content/categories";
import { getProductsByCategory, getProductCountLabel } from "@/lib/data/products";
import { buildDynamicFilterGroups } from "@/lib/filters";
import { CategorySlug } from "@/types";

export const revalidate = 60; // re-fetch from Supabase at most once a minute

export function generateStaticParams() {
  const categories: CategorySlug[] = ["women", "men", "kids"];
  return categories.map((category) => ({ category }));
}

export function generateMetadata({
  params,
}: {
  params: { category: string };
}) {
  const content = getCategoryContent(params.category);
  if (!content) return {};
  return {
    title: `${content.hero.title} — Local`,
    description: content.hero.description,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: { category: string };
}) {
  const content = getCategoryContent(params.category);
  if (!content) notFound();

  const [products, productCount] = await Promise.all([
    getProductsByCategory(content.slug),
    getProductCountLabel(content.slug),
  ]);

  return (
    <main className="min-h-screen bg-white">
      <Header />
      <Breadcrumb current={content.label} />
      <CategoryHero hero={content.hero} />
      <CollectionCards cards={content.collectionCards} />
      <CategoryShoppingArea
        filterGroups={buildDynamicFilterGroups(products)}
        products={products}
        productCount={productCount}
        featuredBrand={content.featuredBrand}
      />
      <Footer />
    </main>
  );
}
