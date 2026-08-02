import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BrandCollectionsExperience from "@/components/brand/BrandCollectionsExperience";
import CollectionsManager from "@/components/brand/CollectionsManager";
import { getPublicCollectionsForBrand } from "@/lib/data/brandCollections";
import { getBrandContent } from "@/lib/data/brands";
import type { CollectionExperienceItem, CollectionExperienceProduct } from "@/lib/data/collectionExperience";

// Overrides the shared layout's `revalidate = 60` (Next.js uses the lowest
// value across the whole route tree) — this page's own data (collection
// covers/products/pause state, all editable in-place by
// CollectionsManager) needs to be fresh on every load, not served from a
// stale ISR snapshot for up to a minute. router.refresh() after a save
// only helps once the underlying fetches themselves aren't cached; without
// this, a just-uploaded cover photo could sit invisible on the public card
// for up to 60s after the management panel already showed it correctly.
// All three directives set below are belt-and-suspenders for the exact
// same goal — `revalidate = 0` alone left production still serving stale
// covers for some viewers, most likely because Vercel's Data Cache is
// durable *across* deployments (redeploying doesn't clear it on its own)
// and/or its edge network cached an early response before this fix
// shipped; `dynamic`/`fetchCache` are the more explicit, harder-to-miss
// opt-outs of every cache layer Next.js controls for this route.
export const revalidate = 0;
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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
  // Every collection here is real — no demo/placeholder filler (removed
  // per owner feedback: fake products shown inside a real collection with
  // 0 real products assigned was actively confusing, not helpful). A
  // collection with nothing assigned yet just shows an empty state
  // prompting the owner to use "Choose products" above.
  const collectionItems: CollectionExperienceItem[] = records.map((collection) => {
    const matchingProducts = brand.products.filter((product) => product.collectionId === collection.id);
    const products: CollectionExperienceProduct[] = matchingProducts.slice(0, 4).map((product) => ({
      id: product.id,
      name: product.name,
      note: product.collectionName || product.productTypeName,
      price: product.price,
      currency: product.currency,
      image: product.image,
      href: `/product/${product.id}`,
    }));

    return {
      id: collection.id,
      name: collection.name,
      eyebrow: collection.tagline || `${matchingProducts.length} piece${matchingProducts.length === 1 ? "" : "s"}`,
      season: collection.publishedAt
        ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(new Date(collection.publishedAt))
        : "Current edit",
      description: collection.description || `A considered edit of signature ${brand.name} pieces, selected to be worn together.`,
      // No fallback stock photo — a real collection with no cover uploaded
      // yet just shows the carousel's own empty state (and, for the
      // owner, its "add photo" control), never a fake stand-in image.
      coverImages: collection.coverImageUrls,
      products,
    };
  });

  return (
    <section className="bg-[#fcf8f3]">
      <div className="mx-auto max-w-brand px-5 pb-16 pt-8 sm:px-6 lg:px-10 lg:pb-20 lg:pt-10">
        <CollectionsManager brandSlug={slug} />
        <BrandCollectionsExperience
          brandName={brand.name}
          collections={collectionItems}
          pageTitle={brand.collectionsPageTitle}
          detailEyebrow={brand.collectionsDetailEyebrow}
          detailHeading={brand.collectionsDetailHeading}
        />
      </div>
    </section>
  );
}
