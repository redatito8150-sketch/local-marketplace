import Skeleton, { SkeletonCircle, SkeletonText } from "@/components/shared/Skeleton";

// Matches BrandsDirectory's grid-view BrandCard: h-44 cover image, an
// overlapping rounded logo tile, a title line, and a metadata line below.
export default function BrandCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[22px] border border-[#e8e0d5] bg-[#fffdf9] shadow-[0_8px_30px_rgba(67,45,29,0.06)]">
      <Skeleton className="h-44 rounded-none" />
      <div className="relative flex min-h-[130px] flex-col px-4 pb-1 pt-1">
        <SkeletonCircle size={64} className="absolute -top-3 left-4 rounded-2xl border-2 border-white" />
        <div className="ml-[72px] mt-2 space-y-2">
          <Skeleton variant="text" className="h-4 w-2/3" />
          <SkeletonText lines={1} lineClassName="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function BrandCardSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <BrandCardSkeleton key={index} />
      ))}
    </div>
  );
}
