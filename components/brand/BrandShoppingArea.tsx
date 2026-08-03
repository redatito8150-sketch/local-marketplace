"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FilterGroup, Product, ViewMode } from "@/types";
import { useProductFilters } from "@/lib/hooks/useProductFilters";
import ProductGrid from "@/components/category/ProductGrid";
import CatalogControls, { CatalogEmptyState } from "@/components/category/CatalogControls";

// Maps a Shop-the-Look tile's query string (e.g. "?type=Dresses") onto the
// matching filter group id, so clicking a tile lands with that filter
// already checked instead of just scrolling to an unfiltered grid.
const URL_PARAM_TO_GROUP: Record<string, string> = {
  type: "productType",
  category: "mainCategory",
  material: "material",
  collection: "collection",
  fit: "fit",
  color: "color",
  size: "size",
};

function initialSelectedFromParams(params: URLSearchParams): Record<string, string[]> {
  const selected: Record<string, string[]> = {};
  for (const [param, groupId] of Object.entries(URL_PARAM_TO_GROUP)) {
    const value = params.get(param);
    if (value) selected[groupId] = [value];
  }
  return selected;
}

export default function BrandShoppingArea({
  brandName,
  products,
  filterGroups,
  showHeading = true,
  compactProducts = true,
  roomyProducts = false,
  mediumProducts = false,
  minimalProductCards = false,
}: {
  brandName: string;
  products: Product[];
  filterGroups: FilterGroup[];
  showHeading?: boolean;
  compactProducts?: boolean;
  roomyProducts?: boolean;
  mediumProducts?: boolean;
  minimalProductCards?: boolean;
}) {
  const searchParams = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const { selected, sort, setSort, toggleFilter, clearFilters, sortedProducts, priceBounds, setPriceRange } =
    useProductFilters(products, initialSelectedFromParams(searchParams));

  return (
    <>
      <section id="shop" className={`mx-auto max-w-brand ${showHeading ? "px-6 py-16 lg:px-10" : "pt-2 lg:pt-3"}`}>
        {showHeading && <h2 className="mb-8 text-2xl font-medium tracking-tight text-charcoal">
          Shop {brandName}
        </h2>}

        <div>
          <CatalogControls
            groups={filterGroups}
            products={products}
            selected={selected}
            onToggle={toggleFilter}
            onClear={clearFilters}
            productCount={sortedProducts.length}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sort={sort}
            onSortChange={setSort}
            priceBounds={priceBounds}
            onPriceChange={setPriceRange}
          />

          <div className={minimalProductCards ? "pt-6 lg:pt-7" : "pt-7"}>
            {sortedProducts.length === 0 ? (
              <CatalogEmptyState onClear={clearFilters} />
            ) : (
              <ProductGrid
                products={sortedProducts}
                viewMode={viewMode}
                compact={compactProducts}
                roomy={roomyProducts}
                medium={mediumProducts}
                minimalCard={minimalProductCards}
              />
            )}
          </div>
        </div>
      </section>
    </>
  );
}
