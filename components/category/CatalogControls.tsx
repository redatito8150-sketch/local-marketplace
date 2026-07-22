"use client";

import type { FilterGroup, Product, SortOption, ViewMode } from "@/types";
import HorizontalFilters from "./HorizontalFilters";
import ProductsToolbar from "./ProductsToolbar";

export default function CatalogControls({
  groups,
  products,
  selected,
  onToggle,
  onClear,
  productCount,
  viewMode,
  onViewModeChange,
  sort,
  onSortChange,
}: {
  groups: FilterGroup[];
  products: Product[];
  selected: Record<string, string[]>;
  onToggle: (groupId: string, optionId: string) => void;
  onClear: () => void;
  productCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-stone-150 pb-4">
      <HorizontalFilters
        groups={groups}
        products={products}
        selected={selected}
        onToggle={onToggle}
        onClear={onClear}
      />
      <ProductsToolbar
        productCount={productCount}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        sort={sort}
        onSortChange={onSortChange}
        compact
      />
    </div>
  );
}

export function CatalogEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-[15px] font-medium text-ink">No products match these filters</p>
      <button onClick={onClear} className="mt-3 text-[13px] font-medium text-mahalyred">
        Clear all filters
      </button>
    </div>
  );
}
