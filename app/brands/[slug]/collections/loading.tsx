import Skeleton from "@/components/shared/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-brand px-5 pb-16 pt-8 sm:px-6 lg:px-10 lg:pb-20 lg:pt-10">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index}>
            <Skeleton className="aspect-[4/5] w-full rounded-[20px]" />
            <Skeleton variant="text" className="mt-3 h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
