import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Skeleton from "@/components/shared/Skeleton";
import { ProductCardSkeletonGrid } from "@/components/shared/ProductCardSkeleton";

export default function Loading() {
  return (
    <main className="min-h-screen bg-cream">
      <Header />
      <section className="mx-auto max-w-screen2xl px-8 py-12 lg:px-12 lg:py-16" aria-label="Loading wishlist" aria-busy="true">
        <Skeleton variant="text" className="h-8 w-48" />
        <div className="mt-8">
          <ProductCardSkeletonGrid count={8} />
        </div>
      </section>
      <Footer />
    </main>
  );
}
