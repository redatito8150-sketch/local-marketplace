"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BrandCategoryTab, FilterGroup, Product, ViewMode } from "@/types";
import { useProductFilters } from "@/lib/hooks/useProductFilters";
import CategoryNav from "@/components/brand/CategoryNav";
import ProductGrid from "@/components/category/ProductGrid";
import CatalogControls, { CatalogEmptyState } from "@/components/category/CatalogControls";

// Maps a Shop-the-Look tile's query string (e.g. "?type=Dresses") onto the
// matching filter group id, so clicking a tile lands with that filter
// already checked instead of just scrolling to an unfiltered grid.
const URL_PARAM_TO_GROUP: Record<string, string> = {
  type: "productType",
  category: "productCategory",
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
  categoryTabs,
  defaultActiveTab,
}: {
  brandName: string;
  products: Product[];
  filterGroups: FilterGroup[];
  categoryTabs: BrandCategoryTab[];
  defaultActiveTab: string;
}) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(defaultActiveTab || "shop-all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const { selected, sort, setSort, toggleFilter, clearFilters, sortedProducts } =
    useProductFilters(products, initialSelectedFromParams(searchParams));

  // Category tabs are brand-curated free text (an admin can name them
  // anything), so there's no guaranteed schema field they map to. "Shop
  // All" always shows everything; any other tab matches against the
  // product's own Collection value (case-insensitive) — the same field an
  // admin already fills in per product — and falls back to showing
  // everything rather than an empty grid if nothing matches yet.
  const tabFilteredProducts = useMemo(() => {
    if (!activeTab || activeTab === "shop-all") return sortedProducts;
    const tabLabel = categoryTabs.find((t) => t.id === activeTab)?.label;
    if (!tabLabel) return sortedProducts;
    const matches = sortedProducts.filter(
      (p) => p.collection?.toLowerCase() === tabLabel.toLowerCase()
    );
    return matches.length > 0 ? matches : sortedProducts;
  }, [sortedProducts, activeTab, categoryTabs]);

  return (
    <>
      {categoryTabs.length > 0 && (
        <CategoryNav tabs={categoryTabs} active={activeTab} onChange={setActiveTab} />
      )}

      <section id="shop" className="mx-auto max-w-brand px-6 py-16 lg:px-10">
        <h2 className="mb-8 text-2xl font-medium tracking-tight text-charcoal">
          Shop {brandName}
        </h2>

        <div>
          <CatalogControls
            groups={filterGroups}
            products={products}
            selected={selected}
            onToggle={toggleFilter}
            onClear={clearFilters}
            productCount={tabFilteredProducts.length}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sort={sort}
            onSortChange={setSort}
          />

          <div className="pt-7">
            {tabFilteredProducts.length === 0 ? (
              <CatalogEmptyState onClear={clearFilters} />
            ) : (
              <ProductGrid products={tabFilteredProducts} viewMode={viewMode} compact />
            )}
          </div>
        </div>
      </section>
    </>
  );
}
