import { ProductCardSkeletonGrid } from "@/components/shared/ProductCardSkeleton";

// Without this, Next.js falls back to the nearest ancestor loading
// boundary — app/brands/loading.tsx, the *directory* page's skeleton
// (hero + brand-card grid) — which looks nothing like this page and made
// every brand-products load flash a mismatched, oddly-proportioned shell.
export default function Loading() {
  return (
    <section className="mx-auto max-w-brand px-5 py-6 sm:px-6 lg:px-10 lg:py-8">
      <ProductCardSkeletonGrid count={12} className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4" />
    </section>
  );
}
