import Skeleton, { SkeletonText } from "@/components/shared/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-brand px-5 pb-14 pt-10 sm:px-6 lg:px-10 lg:pb-20 lg:pt-12">
      <Skeleton variant="text" className="h-8 w-full max-w-md" />
      <SkeletonText lines={3} className="mt-5 max-w-2xl" lineClassName="h-3.5" />
      <Skeleton className="mt-10 h-[280px] w-full rounded-[24px] sm:h-[380px]" />
      <SkeletonText lines={4} className="mt-10 max-w-2xl" lineClassName="h-3.5" />
    </div>
  );
}
