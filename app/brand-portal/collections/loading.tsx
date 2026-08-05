import PageHeaderSkeleton from "@/components/shared/PageHeaderSkeleton";
import Skeleton from "@/components/shared/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-5" aria-label="Loading collections" aria-busy="true">
      <PageHeaderSkeleton />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-2xl border border-stone-150 bg-white">
            <Skeleton className="h-40 rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton variant="text" className="h-4 w-2/3" />
              <Skeleton variant="text" className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
