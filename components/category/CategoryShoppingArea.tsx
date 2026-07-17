"use client";

import { useMemo, useState } from "react";
import { FilterGroup, Product, SortOption, ViewMode, FeaturedBrandContent } from "@/types";
import FilterSidebar from "./FilterSidebar";
import ProductsToolbar from "./ProductsToolbar";
import ProductGrid from "./ProductGrid";
import FeaturedBrand from "./FeaturedBrand";

export default function CategoryShoppingArea({
  filterGroups,
  products,
  productCount,
  featuredBrand,
}: {
  filterGroups: FilterGroup[];
  products: Product[];
  productCount: number;
  featuredBrand: FeaturedBrandContent;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortOption>("newest");

  const sortedProducts = useMemo(() => {
    const list = [...products];
    switch (sort) {
      case "price-asc":
        return list.sort((a, b) => a.price - b.price);
      case "price-desc":
        return list.sort((a, b) => b.price - a.price);
      case "top-rated":
        return list.sort((a, b) => b.rating - a.rating);
      default:
        return list;
    }
  }, [products, sort]);

  return (
    <section className="mx-auto max-w-screen3xl px-8 pb-20 pt-10 lg:px-[60px]">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <FilterSidebar groups={filterGroups} />

        <div className="border-t border-stone-150 pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
          <ProductsToolbar
            productCount={productCount}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sort={sort}
            onSortChange={setSort}
          />

          <ProductGrid products={sortedProducts} viewMode={viewMode} />

          <div className="mt-14">
            <FeaturedBrand content={featuredBrand} />
          </div>
        </div>
      </div>
    </section>
  );
}
