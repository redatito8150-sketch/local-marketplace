import Skeleton, { SkeletonCircle, SkeletonText } from "@/components/shared/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-brand px-5 pb-16 pt-9 sm:px-6 lg:px-10 lg:pb-20 lg:pt-11">
      <Skeleton className="h-32 w-full rounded-[20px]" />
      <div className="mt-10 space-y-8">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex gap-3">
            <SkeletonCircle size={40} />
            <div className="flex-1">
              <Skeleton variant="text" className="h-3.5 w-32" />
              <SkeletonText lines={2} className="mt-3" lineClassName="h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
