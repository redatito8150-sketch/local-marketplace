"use client";

import { useState } from "react";
import { FilterGroup, Product, ViewMode, FeaturedBrandContent } from "@/types";
import { useProductFilters } from "@/lib/hooks/useProductFilters";
import FilterSidebar from "./FilterSidebar";
import ProductsToolbar from "./ProductsToolbar";
import ProductGrid from "./ProductGrid";
import FeaturedBrand from "./FeaturedBrand";
import CatalogControls, { CatalogEmptyState } from "./CatalogControls";

export default function CategoryShoppingArea({
  filterGroups,
  products,
  featuredBrand,
  compact = false,
}: {
  filterGroups: FilterGroup[];
  products: Product[];
  productCount?: number;
  featuredBrand: FeaturedBrandContent;
  compact?: boolean;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const { selected, sort, setSort, toggleFilter, clearFilters, sortedProducts } =
    useProductFilters(products);

  return (
    <section className={`${compact ? "mx-auto max-w-[1680px] px-5 pb-16 pt-5 sm:px-8 lg:px-[60px]" : "mx-auto max-w-screen3xl px-8 pb-20 pt-10 lg:px-[60px]"}`}>
      {compact && (
        <div className="mb-5">
          <CatalogControls groups={filterGroups} products={products} selected={selected} onToggle={toggleFilter} onClear={clearFilters} productCount={sortedProducts.length} viewMode={viewMode} onViewModeChange={setViewMode} sort={sort} onSortChange={setSort} />
        </div>
      )}
      {compact ? (
        <>
          {sortedProducts.length === 0 ? (
            <CatalogEmptyState onClear={clearFilters} />
          ) : <ProductGrid products={sortedProducts} viewMode={viewMode} compact />}
          <div className="mt-7"><FeaturedBrand content={featuredBrand} compact /></div>
        </>
      ) : (
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <FilterSidebar
          groups={filterGroups}
          selected={selected}
          onToggle={toggleFilter}
          onClear={clearFilters}
        />

        <div className="border-t border-stone-150 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          <ProductsToolbar
            productCount={sortedProducts.length}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sort={sort}
            onSortChange={setSort}
          />

          {sortedProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <p className="text-[15px] font-medium text-ink">No products match these filters</p>
              <button
                onClick={clearFilters}
                className="mt-3 text-[13px] font-medium text-ink-soft/60 underline-offset-2 hover:text-ink hover:underline"
              >
                Clear all filters
              </button>
            </div>
          ) : (
            <ProductGrid products={sortedProducts} viewMode={viewMode} />
          )}

          <div className="mt-14">
            <FeaturedBrand content={featuredBrand} />
          </div>
        </div>
      </div>
      )}
    </section>
  );
}
