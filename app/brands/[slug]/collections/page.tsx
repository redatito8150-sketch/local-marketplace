import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BrandCollectionsExperience from "@/components/brand/BrandCollectionsExperience";
import CollectionsManager from "@/components/brand/CollectionsManager";
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
  const liveItems: CollectionExperienceItem[] = records.map((collection, index) => {
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
      eyebrow: collection.tagline || `${matchingProducts.length || products.length} pieces`,
      season: collection.publishedAt
        ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(new Date(collection.publishedAt))
        : "Current edit",
      description: collection.description || `A considered edit of signature ${brand.name} pieces, selected to be worn together.`,
      coverImages: collection.coverImageUrls.length ? collection.coverImageUrls : [demoCollectionDefinitions[index % demoCollectionDefinitions.length].coverImage],
      products,
    };
  });

  // Only pad with clearly-labeled demo items up to 4 when the brand hasn't
  // set up real collections yet — a brand with 4+ real ones never sees
  // any demo filler.
  const missingDemoItems: CollectionExperienceItem[] = liveItems.length < 4 ? buildDemoCollectionItems(liveItems.length) : [];
  const collectionItems = [...liveItems, ...missingDemoItems];

  return (
    <section className="bg-[#fcf8f3]">
      <div className="mx-auto max-w-brand px-5 pb-16 pt-8 sm:px-6 lg:px-10 lg:pb-20 lg:pt-10">
        <CollectionsManager brandSlug={slug} />
        <BrandCollectionsExperience
          brandName={brand.name}
          collections={collectionItems}
          pageTitle={brand.collectionsPageTitle}
        />
      </div>
    </section>
  );
}
