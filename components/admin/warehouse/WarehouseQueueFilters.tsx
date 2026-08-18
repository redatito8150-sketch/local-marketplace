"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import DateRangePicker from "@/components/ui/DateRangePicker";

type StatusFilter = "" | "open" | "action_required" | "received";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "open", label: "Requested" },
  { value: "action_required", label: "Needs review" },
  { value: "received", label: "Received" },
];

export default function WarehouseQueueFilters({
  q,
  status,
  brand,
  from,
  to,
  brandOptions,
}: {
  q: string;
  status: string;
  brand: string;
  from: string;
  to: string;
  brandOptions: [string, string][];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(q);

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

  return (
    <div className="border-b border-[#e4ddd7] px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <form onSubmit={submitSearch} className="relative min-w-0 flex-1 sm:flex-none">
            <label className="sr-only" htmlFor="warehouse-search">Search warehouse documents</label>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9d8f84]" />
            <input
              id="warehouse-search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                navigate({ q: event.currentTarget.value.trim() });
              }}
              autoComplete="off"
              placeholder="Search document, brand, product or SKU"
              className="h-10 w-full rounded-xl border border-[#e7ddd5] bg-[#fcfaf8] pl-9 pr-3 text-[11px] text-[#403730] outline-none transition placeholder:text-[#9b8d82] focus:border-[#C85956]/45 focus:bg-white focus:ring-4 focus:ring-[#C85956]/8 sm:w-[330px]"
            />
          </form>
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
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1 xl:pb-0">
          <div aria-label="Document status" className="flex h-10 flex-none items-center overflow-hidden rounded-xl border border-[#e7ddd5] bg-white">
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
                  {filter.label}
                </button>
              );
            })}
          </div>

          <label className="sr-only" htmlFor="warehouse-brand-filter">Partner brand</label>
          <select
            id="warehouse-brand-filter"
            value={brand}
            onChange={(event) => navigate({ brand: event.target.value })}
            className="h-10 min-w-[148px] rounded-xl border border-[#e7ddd5] bg-white px-3 text-[10px] font-bold text-[#5d5148] outline-none transition focus:border-[#C85956]/45 focus:ring-4 focus:ring-[#C85956]/8"
          >
            <option value="">All brands</option>
            {brandOptions.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
