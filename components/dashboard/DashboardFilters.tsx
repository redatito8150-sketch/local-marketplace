import Link from "next/link";
import { Children, isValidElement, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import AutoSubmitForm from "@/components/dashboard/AutoSubmitForm";

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
  const items = Children.toArray(children);
  const moreIndex = items.findIndex((child) => isValidElement(child) && child.type === DashboardMoreFilters);
  const primaryItems = moreIndex >= 0 ? items.slice(0, moreIndex) : items;
  const trailingItems = moreIndex >= 0 ? items.slice(moreIndex) : [];

  return (
    <AutoSubmitForm action={action} className="mt-5">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {primaryItems}
        {activeCount > 0 && (
          <Link href={clearHref} aria-label={`Clear ${activeCount} active ${activeCount === 1 ? "filter" : "filters"}`} className="order-[5] inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-2.5 text-[10.5px] font-bold text-[#75685f] transition-colors hover:bg-[#f7f1ec] hover:text-[#C85956] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C85956]/25">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
          </Link>
        )}
        {trailingItems}
      </div>
    </AutoSubmitForm>
  );
}

export function DashboardFilterField({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const compactSearch = label === "Search" || label === "Actor";
  return (
    <label className={`${compactSearch ? "order-[1]" : ""} flex min-w-0 flex-col ${compactSearch ? "w-full sm:w-[320px] sm:flex-none" : "w-full sm:w-auto"} ${className}`} style={compactSearch ? { flex: "0 1 320px" } : undefined}>
      <span className="sr-only">{label}</span>
      {children}
    </label>
  );
}

export const dashboardFilterControl =
  "h-10 min-w-0 rounded-xl border border-[#e5ddd5] bg-[#fcfaf8] px-3 text-[11.5px] font-semibold text-[#51473f] outline-none transition-[border-color,background-color,box-shadow] placeholder:font-normal placeholder:text-[#9b8d82] hover:border-[#d8ccc3] focus:border-[#C85956]/45 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#C85956]/8 focus-visible:border-[#C85956]/45 focus-visible:ring-4 focus-visible:ring-[#C85956]/8 sm:min-w-[148px]";

export function DashboardMoreFilters({
  children,
  active = false,
  label = "More filters",
  className = "",
}: {
  children: ReactNode;
  active?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <details className={`group/filters relative order-[6] flex-none ${className}`}>
      <summary
        aria-label={label}
        data-dashboard-filter-control="true"
        className="relative flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-[#e5ddd5] bg-[#fcfaf8] text-[#75685f] outline-none transition-colors hover:bg-white hover:text-[#C85956] [&::-webkit-details-marker]:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        {active ? <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#C85956]" /> : null}
      </summary>
      <div className="absolute right-0 top-[calc(100%+8px)] z-40 grid w-[min(92vw,680px)] gap-3 rounded-2xl border border-[#e6ded7] bg-white p-4 shadow-[0_18px_48px_rgba(72,50,36,.14)] sm:grid-cols-2 lg:grid-cols-3">
        {children}
      </div>
    </details>
  );
}
