"use client";

import { useMemo, useState } from "react";
import { FilterGroup, Product, SortOption, ViewMode, FeaturedBrandContent } from "@/types";
import FilterSidebar from "./FilterSidebar";
import ProductsToolbar from "./ProductsToolbar";
import ProductGrid from "./ProductGrid";
import FeaturedBrand from "./FeaturedBrand";

function matchesPriceRange(price: number, rangeId: string): boolean {
  switch (rangeId) {
    case "under-500":
      return price < 500;
    case "500-1000":
      return price >= 500 && price <= 1000;
    case "1000-2000":
      return price > 1000 && price <= 2000;
    case "2000-5000":
      return price > 2000 && price <= 5000;
    case "above-5000":
      return price > 5000;
    default:
      return true;
  }
}

function matchesRating(rating: number, ratingId: string): boolean {
  switch (ratingId) {
    case "4-plus":
      return rating >= 4;
    case "3-plus":
      return rating >= 3;
    default:
      return true;
  }
}

function matchesAvailability(inStock: boolean, availabilityId: string): boolean {
  switch (availabilityId) {
    case "in-stock":
      return inStock;
    case "out-of-stock":
      return !inStock;
    default:
      return true;
  }
}

export default function CategoryShoppingArea({
  filterGroups,
  products,
  featuredBrand,
}: {
  filterGroups: FilterGroup[];
  products: Product[];
  productCount?: number;
  featuredBrand: FeaturedBrandContent;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortOption>("newest");
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const toggleFilter = (groupId: string, optionId: string) => {
    setSelected((prev) => {
      const current = prev[groupId] ?? [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [groupId]: next };
    });
  };

  const clearFilters = () => setSelected({});

  const filteredProducts = useMemo(() => {
    // Brand/size/color/category/type/collection/material/fit options are
    // generated from real product data with id === label (lib/filters.ts),
    // so matching is a direct value comparison — no reverse lookup into
    // filterGroups needed.
    const selectedBrandIds = selected.brand ?? [];
    const selectedPriceIds = selected.price ?? [];
    const selectedSizeIds = selected.size ?? [];
    const selectedColorIds = selected.color ?? [];
    const selectedCategoryIds = selected.productCategory ?? [];
    const selectedTypeIds = selected.productType ?? [];
    const selectedCollectionIds = selected.collection ?? [];
    const selectedMaterialIds = selected.material ?? [];
    const selectedFitIds = selected.fit ?? [];
    const selectedAvailabilityIds = selected.availability ?? [];
    const selectedRatingIds = selected.rating ?? [];
    const selectedFeaturedIds = selected.featured ?? [];

    return products.filter((product) => {
      if (selectedBrandIds.length > 0 && !selectedBrandIds.includes(product.brand)) {
        return false;
      }

      // Price — OR across selected ranges (a product only needs to fall
      // into one of the checked ranges)
      if (
        selectedPriceIds.length > 0 &&
        !selectedPriceIds.some((rangeId) => matchesPriceRange(product.price, rangeId))
      ) {
        return false;
      }

      // Size — product must offer at least one of the selected sizes
      if (
        selectedSizeIds.length > 0 &&
        !product.sizes.some((size) => selectedSizeIds.includes(size))
      ) {
        return false;
      }

      // Color — product must offer at least one of the selected colors
      if (
        selectedColorIds.length > 0 &&
        !product.colors.some((color) => selectedColorIds.includes(color.name))
      ) {
        return false;
      }

      if (
        selectedCategoryIds.length > 0 &&
        (!product.productCategory || !selectedCategoryIds.includes(product.productCategory))
      ) {
        return false;
      }

      if (
        selectedTypeIds.length > 0 &&
        (!product.productType || !selectedTypeIds.includes(product.productType))
      ) {
        return false;
      }

      if (
        selectedCollectionIds.length > 0 &&
        (!product.collection || !selectedCollectionIds.includes(product.collection))
      ) {
        return false;
      }

      if (
        selectedMaterialIds.length > 0 &&
        (!product.material || !selectedMaterialIds.includes(product.material))
      ) {
        return false;
      }

      if (selectedFitIds.length > 0 && (!product.fit || !selectedFitIds.includes(product.fit))) {
        return false;
      }

      // Availability — OR across selected states (usually only one is picked)
      if (
        selectedAvailabilityIds.length > 0 &&
        !selectedAvailabilityIds.some((id) => matchesAvailability(product.inStock, id))
      ) {
        return false;
      }

      // Rating — OR across selected thresholds
      if (
        selectedRatingIds.length > 0 &&
        !selectedRatingIds.some((id) => matchesRating(product.rating, id))
      ) {
        return false;
      }

      if (selectedFeaturedIds.length > 0 && !product.featured) {
        return false;
      }

      return true;
    });
  }, [products, selected]);

  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
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
  }, [filteredProducts, sort]);

  return (
    <section className="mx-auto max-w-screen3xl px-8 pb-20 pt-10 lg:px-[60px]">
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
    </section>
  );
}
