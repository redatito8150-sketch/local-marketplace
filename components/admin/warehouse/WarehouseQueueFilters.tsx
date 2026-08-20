"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import DateRangePicker from "@/components/ui/DateRangePicker";
import { DashboardFilterField, DashboardMoreFilters, dashboardFilterControl } from "@/components/dashboard/DashboardFilters";

type StatusFilter = "" | "requested" | "approved" | "action_required" | "received";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string; tone: string }> = [
  { value: "", label: "All", tone: "bg-[#C85956]" },
  { value: "requested", label: "Requested", tone: "bg-amber-400" },
  { value: "approved", label: "Awaiting arrival", tone: "bg-[#a9bbc5]" },
  { value: "action_required", label: "Needs review", tone: "bg-red-500" },
  { value: "received", label: "Received", tone: "bg-emerald-500" },
];

export default function WarehouseQueueFilters({
  q,
  status,
  brand,
  from,
  to,
  brandOptions,
  statusCounts,
}: {
  q: string;
  status: string;
  brand: string;
  from: string;
  to: string;
  brandOptions: [string, string][];
  statusCounts: Record<StatusFilter, number>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  function navigate(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    router.push(`/admin/warehouse${next.size ? `?${next.toString()}` : ""}`);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedQuery = new FormData(event.currentTarget).get("q")?.toString().trim() ?? "";
    navigate({ q: submittedQuery });
  }

  function updateQuery(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => navigate({ q: value.trim() }), 320);
  }

  return (
    <div data-dashboard-filters="true">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <form onSubmit={submitSearch} className="relative order-[1] min-w-0 flex-1 sm:w-[320px] sm:flex-none">
            <label className="sr-only" htmlFor="warehouse-search">Search warehouse documents</label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9d8f84]" />
            <input
              id="warehouse-search"
              name="q"
              value={query}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                navigate({ q: event.currentTarget.value.trim() });
              }}
              autoComplete="off"
              placeholder="Search document, brand, product or SKU"
              className="h-10 w-full rounded-xl border border-[#e7ddd5] bg-[#fcfaf8] pl-9 pr-3 text-[11px] text-[#403730] outline-none transition placeholder:text-[#9b8d82] hover:border-[#d8ccc3] focus:border-[#C85956]/45 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#C85956]/8 sm:w-[320px]"
            />
          </form>
          <div aria-label="Document status" className="order-[2] flex h-10 min-w-0 flex-none items-center overflow-x-auto rounded-xl border border-[#e7ddd5] bg-white">
            {STATUS_FILTERS.map((filter) => {
              const active = status === filter.value;
              return (
                <button
                  key={filter.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => navigate({ status: filter.value })}
                  className={`h-full whitespace-nowrap border-r border-[#eee7e1] px-3 text-[10px] font-bold transition last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C85956]/30 ${active ? "bg-[#f7e8e6] text-[#C85956]" : "text-[#6f6259] hover:bg-[#fcfaf8] hover:text-[#302924]"}`}
                >
                  <span aria-hidden="true" className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${filter.tone}`} />
                  <span>{filter.label}</span>
                  <span className="ml-1.5 tabular-nums text-[9px] opacity-65">{statusCounts[filter.value]}</span>
                </button>
              );
            })}
          </div>
          <DateRangePicker
            key={`${from}-${to}`}
            defaultFrom={from}
            defaultTo={to}
            fromName={null}
            toName={null}
            label="Requested date range"
            compact
            onRangeChange={(range) => navigate(range)}
          />
          <DashboardMoreFilters label="More warehouse filters" active={Boolean(brand)}>
            <DashboardFilterField label="Partner brand">
              <select id="warehouse-brand-filter" value={brand} onChange={(event) => navigate({ brand: event.target.value })} className={`${dashboardFilterControl} w-full`}>
                <option value="">All brands</option>
                {brandOptions.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
              </select>
            </DashboardFilterField>
          </DashboardMoreFilters>
      </div>
    </div>
  );
}
