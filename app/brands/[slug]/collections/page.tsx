import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BrandCollectionsExperience from "@/components/brand/BrandCollectionsExperience";
import { getPublicCollectionsForBrand } from "@/lib/data/brandCollections";
import { getBrandContent } from "@/lib/data/brands";
import { buildDemoCollectionItems, demoCollectionDefinitions, makeDemoCollectionProducts, type CollectionExperienceItem, type CollectionExperienceProduct } from "@/lib/data/collectionExperience";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = await getBrandContent(slug);
  return brand
    ? { title: `${brand.name} Collections | Mahaly`, description: `Explore complete looks by ${brand.name}.` }
    : {};
}

export default async function CollectionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const brand = await getBrandContent(slug);
  if (!brand) notFound();

  const records = await getPublicCollectionsForBrand(brand.id);
  const liveItems: CollectionExperienceItem[] = records.slice(0, 4).map((collection, index) => {
    const matchingProducts = brand.products.filter((product) => product.collectionId === collection.id);
    const products: CollectionExperienceProduct[] = matchingProducts.length
      ? matchingProducts.slice(0, 4).map((product) => ({
          id: product.id,
          name: product.name,
          note: product.collectionName || product.productTypeName,
          price: product.price,
          currency: product.currency,
          image: product.image,
          href: `/product/${product.id}`,
        }))
      : makeDemoCollectionProducts(index);

    return {
      id: collection.id,
      name: collection.name,
      eyebrow: `${matchingProducts.length || products.length} pieces`,
      season: collection.publishedAt
        ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(new Date(collection.publishedAt))
        : "Current edit",
      description: collection.description || `A considered edit of signature ${brand.name} pieces, selected to be worn together.`,
      coverImage: collection.coverImageUrl || demoCollectionDefinitions[index].coverImage,
      products,
    };
  });

  const missingDemoItems: CollectionExperienceItem[] = buildDemoCollectionItems(liveItems.length);

  const collectionItems = [...liveItems, ...missingDemoItems].slice(0, 4);

  return (
    <section className="bg-[#fcf8f3]">
      <div className="mx-auto max-w-brand px-5 pb-16 pt-8 sm:px-6 lg:px-10 lg:pb-20 lg:pt-10">
        <BrandCollectionsExperience brandName={brand.name} collections={collectionItems} />
      </div>
    </section>
  );
}
