import Skeleton, { SkeletonButton } from "@/components/shared/Skeleton";

// Title + description + optional right-aligned action button — the header
// shape shared by nearly every admin/brand-portal list page.
export default function PageHeaderSkeleton({ withAction = true }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton variant="text" className="h-3 w-20" />
        <Skeleton variant="text" className="h-7 w-56" />
      </div>
      {withAction ? <SkeletonButton width={140} className="h-10" /> : null}
    </div>
  );
}
