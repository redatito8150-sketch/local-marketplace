import Link from "next/link";
import type { ReactNode } from "react";
import { Filter } from "lucide-react";

export default function DashboardFilters({
  action,
  clearHref,
  activeCount,
  children,
}: {
  action: string;
  clearHref: string;
  activeCount: number;
  children: ReactNode;
}) {
  return (
    <form action={action} className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-700">
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 && <span className="rounded-full bg-mahalyred px-2 py-0.5 text-[10px] text-white">{activeCount}</span>}
        </div>
        {activeCount > 0 && <Link href={clearHref} className="text-[12px] font-semibold text-mahalyred hover:underline">Clear all</Link>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
        {children}
        <button type="submit" className="h-10 rounded-xl bg-slate-900 px-4 text-[12.5px] font-semibold text-white hover:bg-slate-800">
          Apply filters
        </button>
      </div>
    </form>
  );
}

export function DashboardFilterField({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export const dashboardFilterControl =
  "h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-[12.5px] text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 lg:min-w-[150px]";
