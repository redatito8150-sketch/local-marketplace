import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getBrandContent } from "@/lib/data/brands";
import { getPublicCollectionBySlug } from "@/lib/data/brandCollections";
import ProductGrid from "@/components/category/ProductGrid";
import BrandEmptyState from "@/components/brand/BrandEmptyState";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; collectionSlug: string }>;
}): Promise<Metadata> {
  const { slug, collectionSlug } = await params;
  const brand = await getBrandContent(slug);
  const collection = brand ? await getPublicCollectionBySlug(brand.id, collectionSlug) : null;
  return collection ? { title: `${collection.name} | Mahaly`, description: collection.description } : {};
}

// A collection page only ever shows products belonging to BOTH this exact
// brand AND this exact collection id. The slug is used only to resolve the
// brand; once resolved, the collection lookup is scoped by brand.id (not
// slug), and the product filter below re-checks collectionId against that
// same resolved collection — so a collection slug belonging to a different
// brand can never resolve here (it 404s, since getPublicCollectionBySlug
// scoped to this brand's id would find nothing).
export default async function BrandCollectionPage({
  params,
}: {
  params: Promise<{ slug: string; collectionSlug: string }>;
}) {
  const { slug, collectionSlug } = await params;
  const brand = await getBrandContent(slug);
  if (!brand) notFound();
  const collection = await getPublicCollectionBySlug(brand.id, collectionSlug);
  if (!collection) notFound();

  const products = brand.products.filter((product) => product.collectionId === collection.id);

  return (
    <section className="mx-auto max-w-brand px-5 py-14 sm:px-6 lg:px-10 lg:py-20">
      <Link
        href={`/brands/${slug}/collections`}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#8f2335] hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All collections
      </Link>
      <div className="mt-4 max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#8f2335]">Curated by {brand.name}</p>
        <h1 className="mt-2 font-serif text-3xl text-[#261f1b] sm:text-4xl">{collection.name}</h1>
        {collection.description && (
          <p className="mt-4 text-sm leading-6 text-[#736861]">{collection.description}</p>
        )}
      </div>

      {products.length > 0 ? (
        <div className="mt-10">
          <ProductGrid products={products} viewMode="grid" compact />
        </div>
      ) : (
        <div className="pt-12">
          <BrandEmptyState
            title="Nothing in this collection yet"
            description={`${brand.name} hasn't added products to this collection yet.`}
            href={`/brands/${slug}/products`}
            action="Explore all products"
          />
        </div>
      )}
    </section>
  );
}
