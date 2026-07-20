import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductBreadcrumb from "@/components/product/ProductBreadcrumb";
import ProductGallery from "@/components/product/ProductGallery";
import ProductInfo from "@/components/product/ProductInfo";
import ProductAccordion from "@/components/product/ProductAccordion";
import ProductReviews from "@/components/product/ProductReviews";
import RelatedProducts from "@/components/product/RelatedProducts";
import RecentlyViewedTracker from "@/components/product/RecentlyViewedTracker";
import { getProductById, getRelatedProductCards } from "@/lib/data/products";
import { supabase } from "@/lib/supabase/client";

export const revalidate = 60;

export async function generateStaticParams() {
  const { data } = await supabase.from("products").select("id");
  return (data ?? []).map((row) => ({ id: row.id as string }));
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const product = await getProductById(params.id);
  if (!product) return {};
  return {
    title: `${product.name} — ${product.brandName} — Local`,
    description: product.description,
  };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await getProductById(params.id);
  if (!product) notFound();

  const related = await getRelatedProductCards(product.relatedIds);

  return (
    <main className="min-h-screen bg-cream">
      <RecentlyViewedTracker productId={product.id} />
      <Header />

      <ProductBreadcrumb
        categoryLabel={product.categoryLabel}
        categoryHref={product.categoryHref}
        productName={product.name}
      />

      <section className="mx-auto max-w-screen2xl px-8 pb-16 lg:px-12">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-16">
          <ProductGallery images={product.images} alt={product.name} />
          <ProductInfo product={product} />
        </div>

        <div className="mt-16 grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-16">
          <div>
            <ProductAccordion
              description={product.description}
              details={product.details}
              careInstructions={product.careInstructions}
              shippingReturns={product.shippingReturns}
            />
          </div>
          <div />
        </div>

        <div className="mt-4 space-y-16">
          <ProductReviews
            rating={product.rating}
            reviewCount={product.reviewCount}
            reviews={product.reviews}
          />
          <RelatedProducts products={related} />
        </div>
      </section>

      <Footer />
    </main>
  );
}
