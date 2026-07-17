"use client";

import { useMemo, useState } from "react";
import { FilterGroup, Product, SortOption, ViewMode, FeaturedBrandContent } from "@/types";
import FilterSidebar from "./FilterSidebar";
import ProductsToolbar from "./ProductsToolbar";
import ProductGrid from "./ProductGrid";
import FeaturedBrand from "./FeaturedBrand";

function matchesPriceRange(price: number, rangeId: string): boolean {
  switch (rangeId) {
    case "under-50":
      return price < 50;
    case "50-100":
      return price >= 50 && price <= 100;
    case "100-200":
      return price > 100 && price <= 200;
    case "200-500":
      return price > 200 && price <= 500;
    case "above-500":
      return price > 500;
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

  const brandGroup = filterGroups.find((g) => g.id === "brand");
  const sizeGroup = filterGroups.find((g) => g.id === "size");
  const colorGroup = filterGroups.find((g) => g.id === "color");

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
    const selectedBrandIds = selected.brand ?? [];
    const selectedPriceIds = selected.price ?? [];
    const selectedSizeIds = selected.size ?? [];
    const selectedColorIds = selected.color ?? [];
    const selectedAvailabilityIds = selected.availability ?? [];
    const selectedRatingIds = selected.rating ?? [];

    return products.filter((product) => {
      // Brand — every selected brand must match the product's brand name
      if (selectedBrandIds.length > 0 && brandGroup) {
        const brandOption = brandGroup.options.find(
          (opt) => opt.label.toUpperCase() === product.brand.toUpperCase()
        );
        const matchesBrand = brandOption
          ? selectedBrandIds.includes(brandOption.id)
          : false;
        if (!matchesBrand) return false;
      }

      // Price — OR across selected ranges (a product only needs to fall
      // into one of the checked ranges)
      if (selectedPriceIds.length > 0) {
        const matchesPrice = selectedPriceIds.some((rangeId) =>
          matchesPriceRange(product.price, rangeId)
        );
        if (!matchesPrice) return false;
      }

      // Size — product must offer at least one of the selected sizes
      if (selectedSizeIds.length > 0 && sizeGroup) {
        const selectedLabels = selectedSizeIds.map((id) =>
          sizeGroup.options.find((opt) => opt.id === id)?.label.toUpperCase()
        );
        const matchesSize = product.sizes.some((size) =>
          selectedLabels.includes(size.toUpperCase())
        );
        if (!matchesSize) return false;
      }

      // Color — product must offer at least one of the selected colors
      if (selectedColorIds.length > 0 && colorGroup) {
        const selectedLabels = selectedColorIds.map((id) =>
          colorGroup.options.find((opt) => opt.id === id)?.label.toUpperCase()
        );
        const matchesColor = product.colors.some((color) =>
          selectedLabels.includes(color.name.toUpperCase())
        );
        if (!matchesColor) return false;
      }

      // Availability — OR across selected states (usually only one is picked)
      if (selectedAvailabilityIds.length > 0) {
        const matchesStock = selectedAvailabilityIds.some((id) =>
          matchesAvailability(product.inStock, id)
        );
        if (!matchesStock) return false;
      }

      // Rating — OR across selected thresholds
      if (selectedRatingIds.length > 0) {
        const matchesStars = selectedRatingIds.some((id) =>
          matchesRating(product.rating, id)
        );
        if (!matchesStars) return false;
      }

      return true;
    });
  }, [products, selected, brandGroup, sizeGroup, colorGroup]);

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
