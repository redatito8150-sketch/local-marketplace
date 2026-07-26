import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import BrandShoppingArea from "@/components/brand/BrandShoppingArea";
import BrandEmptyState from "@/components/brand/BrandEmptyState";
import { getBrandContent } from "@/lib/data/brands";
import { buildDynamicFilterGroups } from "@/lib/filters";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandContent(slug);
  return brand ? { title: `${brand.name} Products | Mahaly`, description: `Shop all ${brand.name} products on Mahaly.` } : {};
}

export default async function BrandProductsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await getBrandContent(slug);
  if (!brand) notFound();
  const groups = buildDynamicFilterGroups(brand.products).filter((group) => group.id !== "brand");
  return (
    <section className="mx-auto max-w-brand px-5 py-6 sm:px-6 lg:px-10 lg:py-8">
      {brand.products.length ? (
        <Suspense fallback={null}>
          <BrandShoppingArea
            brandName={brand.name}
            products={brand.products}
            filterGroups={groups}
            categoryTabs={[]}
            defaultActiveTab="shop-all"
            showHeading={false}
            compactProducts={false}
            mediumProducts
            minimalProductCards
          />
        </Suspense>
      ) : (
        <div className="pt-8">
          <BrandEmptyState
            title="No products available yet"
            description="This brand is preparing its next edit. Come back soon, or discover the story behind the label."
            href={`/brands/${slug}/about`}
            action="About the brand"
          />
        </div>
      )}
    </section>
  );
}
