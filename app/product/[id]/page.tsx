import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductBreadcrumb from "@/components/product/ProductBreadcrumb";
import ProductGalleryAndInfo from "@/components/product/ProductGalleryAndInfo";
import ProductAccordion from "@/components/product/ProductAccordion";
import ProductReviews from "@/components/product/ProductReviews";
import RelatedProducts from "@/components/product/RelatedProducts";
import RecentlyViewedTracker from "@/components/product/RecentlyViewedTracker";
import { getProductById, getActiveProductsByIds } from "@/lib/data/products";
import { getEligibleOrderItems, getPublicReviews } from "@/lib/reviews/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSubscribedVariantIds } from "@/lib/backInStock";

// This page is viewer-specific: review helpful state, review eligibility,
// back-in-stock subscriptions, and authentication all depend on request
// cookies. Rendering it at request time also keeps the service-role key out
// of ordinary CI builds; privileged review assembly runs only on the trusted
// application server, where that key is configured.
export const dynamic = "force-dynamic";

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const product = await getProductById(params.id);
  if (!product) return {};
  return {
    title: `${product.name} — ${product.brandName} — Zakhnook`,
    description: product.description,
  };
}

export default async function ProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const product = await getProductById(params.id);
  if (!product) notFound();

  const related = await getActiveProductsByIds(product.relatedIds, 4);
  const reviewResult = await getPublicReviews({ productId: product.id, filters: { photos:false, verified:false, replied:false, sort:"recent", page:1 } });
  const serverClient = await createSupabaseServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  const eligibleItems = user ? await getEligibleOrderItems(user.id, product.id) : [];
  const subscribedVariantIds = user ? await getSubscribedVariantIds(user.id, product.id) : [];

  return (
    <main className="flex min-h-screen flex-col [&>*]:w-full bg-cream">
      <RecentlyViewedTracker productId={product.id} />
      <Header />

      <ProductBreadcrumb
        mainCategory={product.mainCategory}
        productGroup={product.productGroup}
        productTypeName={product.productTypeName}
        productName={product.name}
      />

      <section className="mx-auto max-w-screen2xl px-8 pb-16 lg:px-12">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          <ProductGalleryAndInfo product={product} signedIn={Boolean(user)} subscribedVariantIds={subscribedVariantIds} />
        </div>

        <div className="mt-16 grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-16">
          <div>
            <ProductAccordion
              description={product.description}
              details={product.details}
              careInstructions={product.careInstructions}
              materials={product.materials}
              fit={product.fit}
              shippingReturns={product.shippingReturns}
            />
          </div>
          <div />
        </div>

        <div className="mt-4 space-y-16">
          <ProductReviews
            summary={reviewResult.summary}
            reviews={reviewResult.reviews}
            eligibleItem={eligibleItems[0]}
          />
          <RelatedProducts products={related} />
        </div>
      </section>

      <Footer />
    </main>
  );
}
