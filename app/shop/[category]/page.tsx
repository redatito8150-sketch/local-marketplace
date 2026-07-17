import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/category/Breadcrumb";
import CategoryHero from "@/components/category/CategoryHero";
import CollectionCards from "@/components/category/CollectionCards";
import CategoryShoppingArea from "@/components/category/CategoryShoppingArea";
import { getCategoryContent, FILTER_GROUPS } from "@/data/categories";
import { getProductsByCategory, getProductCountLabel } from "@/data/products";
import { CategorySlug } from "@/types";

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

export default function CategoryPage({
  params,
}: {
  params: { category: string };
}) {
  const content = getCategoryContent(params.category);
  if (!content) notFound();

  const products = getProductsByCategory(content.slug);
  const productCount = getProductCountLabel(content.slug);

  return (
    <main className="min-h-screen bg-white">
      <Header />
      <Breadcrumb current={content.label} />
      <CategoryHero hero={content.hero} />
      <CollectionCards cards={content.collectionCards} />
      <CategoryShoppingArea
        filterGroups={FILTER_GROUPS}
        products={products}
        productCount={productCount}
        featuredBrand={content.featuredBrand}
      />
      <Footer />
    </main>
  );
}
