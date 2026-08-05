import Skeleton from "@/components/shared/Skeleton";

// Dashboard/overview-page skeleton — stat cards + two content panels.
// This is correct specifically for the /admin and /brand-portal root
// (overview) pages, which really do look like this. It is NOT a generic
// fallback for every nested route (products list, product editor, orders
// table, ...) — those get their own layout-matched skeleton instead of
// falling through to this one, per the loading-system redesign.
export default function DashboardLoading() {
  return (
    <div className="space-y-8" aria-label="Loading dashboard" aria-busy="true">
      <div>
        <Skeleton variant="text" className="h-3 w-24" />
        <Skeleton variant="text" className="mt-3 h-9 w-64 max-w-full" />
        <Skeleton variant="text" className="mt-3 h-4 w-[420px] max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-80 border border-slate-200 bg-white" />
        <Skeleton className="h-80 border border-slate-200 bg-white" />
      </div>
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="h-40 rounded-2xl border border-slate-200 bg-white p-5">
      <Skeleton className="h-10 w-10 rounded-xl" />
      <Skeleton variant="text" className="mt-5 h-3 w-24" />
      <Skeleton variant="text" className="mt-3 h-7 w-20" />
    </div>
  );
}
