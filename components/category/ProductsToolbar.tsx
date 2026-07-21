"use client";

import { useState } from "react";
import { ChevronDown, LayoutGrid, List } from "lucide-react";
import { SortOption, ViewMode } from "@/types";

const SORT_LABELS: Record<SortOption, string> = {
  newest: "Sort by: Newest",
  "price-asc": "Sort by: Price (Low to High)",
  "price-desc": "Sort by: Price (High to Low)",
  "top-rated": "Sort by: Top Rated",
};

export default function ProductsToolbar({
  productCount,
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
  compact = false,
}: {
  productCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  compact?: boolean;
}) {
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <div
      id="products"
      className={`${compact ? "flex shrink-0 items-center justify-end" : "mb-6 flex items-center justify-between scroll-mt-24"}`}
    >
      {!compact && <p className="text-sm text-ink-soft/70">{productCount} Products</p>}

      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            onClick={() => setSortOpen((o) => !o)}
            className={`flex items-center gap-2 border border-stone-150 bg-white text-[12px] font-medium text-ink transition-colors hover:border-ink/30 ${compact ? "h-9 rounded-full px-4" : "rounded-md px-3.5 py-2"}`}
          >
            {SORT_LABELS[sort]}
            <ChevronDown
              className={`h-3.5 w-3.5 text-ink-soft/60 transition-transform ${
                sortOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {sortOpen && (
            <ul className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-lg border border-stone-150 bg-white shadow-card">
              {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                <li key={key}>
                  <button
                    onClick={() => {
                      onSortChange(key);
                      setSortOpen(false);
                    }}
                    className={`block w-full px-4 py-2.5 text-left text-[13px] transition-colors hover:bg-stone-50 ${
                      sort === key ? "font-semibold text-ink" : "text-ink-soft/75"
                    }`}
                  >
                    {SORT_LABELS[key]}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${compact ? "hidden" : "flex"} items-center gap-1 rounded-md border border-stone-150 p-1`}>
          <button
            aria-label="Grid view"
            onClick={() => onViewModeChange("grid")}
            className={`rounded p-1.5 transition-colors ${
              viewMode === "grid" ? "bg-ink text-cream" : "text-ink-soft/60 hover:bg-stone-50"
            }`}
          >
            <LayoutGrid className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <button
            aria-label="List view"
            onClick={() => onViewModeChange("list")}
            className={`rounded p-1.5 transition-colors ${
              viewMode === "list" ? "bg-ink text-cream" : "text-ink-soft/60 hover:bg-stone-50"
            }`}
          >
            <List className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
