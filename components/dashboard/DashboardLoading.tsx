export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-8" aria-label="Loading dashboard" aria-busy="true">
      <div><div className="h-3 w-24 rounded bg-slate-200" /><div className="mt-3 h-9 w-64 max-w-full rounded bg-slate-200" /><div className="mt-3 h-4 w-[420px] max-w-full rounded bg-slate-200" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
      <div className="grid gap-6 xl:grid-cols-2"><div className="h-80 rounded-2xl border border-slate-200 bg-white" /><div className="h-80 rounded-2xl border border-slate-200 bg-white" /></div>
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-40 rounded-2xl border border-slate-200 bg-white p-5"><div className="h-10 w-10 rounded-xl bg-slate-100" /><div className="mt-5 h-3 w-24 rounded bg-slate-100" /><div className="mt-3 h-7 w-20 rounded bg-slate-200" /></div>;
}
