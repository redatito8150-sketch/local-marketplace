import Skeleton from "@/components/shared/Skeleton";

// Matches CompactProductCard/EditorialProductCard's shared shape: a full-
// bleed aspect-[0.78] rounded-[18px] image tile with a price pill anchored
// at the bottom-left. Used everywhere those cards appear (homepage
// sections, New Arrivals, Offers, wishlist, search results) instead of
// each grid hand-rolling its own placeholder rectangle.
export default function ProductCardSkeleton() {
  return (
    <div className="relative aspect-[0.78] overflow-hidden rounded-[18px] bg-stone-100">
      <Skeleton className="absolute inset-0 rounded-none" />
      <Skeleton className="absolute bottom-4 left-4 h-6 w-20 rounded-full sm:bottom-5 sm:left-5" />
    </div>
  );
}

export function ProductCardSkeletonGrid({
  count = 8,
  className = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className} aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <ProductCardSkeleton key={index} />
      ))}
    </div>
  );
}
